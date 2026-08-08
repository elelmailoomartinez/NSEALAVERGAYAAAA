// content.js
// Improved detection: monitors tweets on Twitter/X and censors those that are not from the selected Mexican state.
// Enhancements:
// - Intercepts fetch/XHR to capture tweet/place metadata when available
// - Extracts tweet IDs from status links to map tweets to metadata
// - Adds more selectors and heuristics for location text inside tweets/profile
// - Reduces false positives by preferring structured place metadata when available

(function() {
  const STATES = [
    "Aguascalientes","Baja California","Baja California Sur","Campeche","Chiapas","Chihuahua","Coahuila","Colima","Durango","Guanajuato","Guerrero","Hidalgo","Jalisco","México","Estado de México","Michoacán","Morelos","Nayarit","Nuevo León","Oaxaca","Puebla","Querétaro","Quintana Roo","San Luis Potosí","Sinaloa","Sonora","Tabasco","Tamaulipas","Tlaxcala","Veracruz","Yucatán","Zacatecas","CDMX","Ciudad de México"
  ];

  function normalize(s){
    if(!s) return '';
    return String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  }
  const normalizedStates = STATES.map(s=>normalize(s));

  // In-memory maps populated by network interception
  const tweetLocationMap = {}; // tweetId -> place text or location string
  const userLocationMap = {}; // username -> profile location string

  // read selected state from storage
  async function getSelectedState(){
    return new Promise(resolve => {
      try{
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(['selectedState'], res => resolve(res.selectedState || null));
        } else {
          resolve(null);
        }
      }catch(e){resolve(null)}
    });
  }

  function matchStateInText(text){
    if(!text) return null;
    const n = normalize(text);
    for(let i=0;i<normalizedStates.length;i++){
      const st = normalizedStates[i].replace('estado de ', '').replace('estado ', '').replace('cdmx','ciudad de mexico').trim();
      if(n.includes(st)) return STATES[i];
    }
    return null;
  }

  // Attempt to extract tweet id from an element (status link) or data attributes
  function extractTweetId(tweetEl){
    try{
      // look for link to status
      const a = tweetEl.querySelector('a[href*="/status/"]');
      if(a && a.href){
        const m = a.href.match(/status\/(\d+)/);
        if(m && m[1]) return m[1];
      }
      // some UIs attach a data-testid or data-item-id
      if(tweetEl.dataset && (tweetEl.dataset.tweetId || tweetEl.dataset.itemId)){
        return tweetEl.dataset.tweetId || tweetEl.dataset.itemId;
      }
      // try ancestors
      const anc = tweetEl.closest('[href]');
      if(anc && anc.href){
        const m = anc.href.match(/status\/(\d+)/);
        if(m && m[1]) return m[1];
      }
    }catch(e){}
    return null;
  }

  // Look for structured place metadata captured by network hooks
  function getStructuredLocationForTweet(tweetEl){
    try{
      const id = extractTweetId(tweetEl);
      if(id && tweetLocationMap[id]) return tweetLocationMap[id];
    }catch(e){}
    return null;
  }

  // Fallback: scan DOM for location-like elements
  function detectStateForTweetByDOM(tweetEl){
    try{
      const textCandidates = [];
      // All text inside tweet
      textCandidates.push(tweetEl.innerText || '');

      // Common selectors for location/profile blocks
      const locSelectors = [
        '[data-testid="User-Location"]',
        'a[aria-label*="Location"]',
        'div[aria-label*="Location"]',
        'svg[aria-label="Location"]',
        '[data-testid="UserProfileHeader_Items"]',
        '[data-testid="UserDescription"]',
        'div[dir="auto"]'
      ];
      locSelectors.forEach(sel=>{
        const el = tweetEl.querySelector(sel) || document.querySelector(sel);
        if(el) textCandidates.push(el.innerText || el.textContent || '');
      });

      // anchors inside tweet (places, profiles)
      const anchors = tweetEl.querySelectorAll('a');
      anchors.forEach(a=>{ if(a && a.innerText) textCandidates.push(a.innerText); });

      // look for small location spans (icons + text)
      const smalls = tweetEl.querySelectorAll('span,div');
      for(const s of smalls){
        const txt = s.innerText || s.textContent || '';
        if(txt && txt.length<60 && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(txt)) textCandidates.push(txt);
      }

      for(const t of textCandidates){
        const st = matchStateInText(t);
        if(st) return st;
      }
      return null;
    }catch(e){return null}
  }

  function censorTweet(tweetEl, reason){
    if(!tweetEl) return;
    if(tweetEl.dataset.__censored_by_region) return;
    tweetEl.dataset.__censored_by_region = '1';

    const overlay = document.createElement('div');
    overlay.style.cssText = 'background:#111;color:#fff;padding:12px;border-radius:6px;text-align:center;cursor:pointer;margin-bottom:6px;';
    overlay.innerText = 'Tweet bloqueado: no corresponde a la región seleccionada. Hacer clic para mostrar.';
    overlay.title = reason || 'Bloqueado por filtro de región';
    overlay.addEventListener('click', ()=>{
      if(overlay.nextSibling && overlay.nextSibling.style){
        const content = overlay.nextSibling;
        if(content.style.display === 'none'){
          content.style.display = '';
          overlay.innerText = 'Tweet bloqueado: no corresponde a la región seleccionada. Hacer clic para ocultar.';
        } else {
          content.style.display = 'none';
          overlay.innerText = 'Tweet bloqueado: no corresponde a la región seleccionada. Hacer clic para mostrar.';
        }
      }
    });

    const contentContainer = document.createElement('div');
    while(tweetEl.firstChild){
      contentContainer.appendChild(tweetEl.firstChild);
    }
    contentContainer.style.display = 'none';
    tweetEl.appendChild(overlay);
    tweetEl.appendChild(contentContainer);
  }

  async function processTweet(tweetEl, selectedState){
    if(!tweetEl) return;
    try{
      // Prefer structured metadata if present
      const structured = getStructuredLocationForTweet(tweetEl);
      if(selectedState && selectedState !== 'Todos'){
        if(structured){
          const st = matchStateInText(structured);
          if(!st){
            // structured exists but doesn't match; fallback to DOM detection as secondary check
            const domSt = detectStateForTweetByDOM(tweetEl);
            if(!domSt){
              censorTweet(tweetEl, `Metadata detectada: ${structured}`);
            } else {
              if(normalize(domSt).indexOf(normalize(selectedState)) === -1 && normalize(selectedState).indexOf(normalize(domSt)) === -1){
                censorTweet(tweetEl, `Metadata detectada: ${structured}; DOM detectada: ${domSt}`);
              }
            }
          } else {
            if(normalize(st).indexOf(normalize(selectedState)) === -1 && normalize(selectedState).indexOf(normalize(st)) === -1){
              censorTweet(tweetEl, `Metadata detectada: ${structured}`);
            }
          }
        } else {
          // No structured metadata - rely on DOM heuristics
          const domSt = detectStateForTweetByDOM(tweetEl);
          if(!domSt){
            // as last resort, check author profile location if available
            const author = tweetEl.querySelector('a[href*="/"], div[role="link"]');
            let username = null;
            try{
              const profileLink = tweetEl.querySelector('a[href^="/"]');
              if(profileLink && profileLink.href){
                const m = profileLink.getAttribute('href').match(/^\/(?!home)([^/]+)\/?$/);
                if(m && m[1]) username = m[1];
              }
            }catch(e){}

            const userLoc = username && userLocationMap[username] ? userLocationMap[username] : null;
            if(userLoc){
              const stU = matchStateInText(userLoc);
              if(!stU){
                censorTweet(tweetEl, 'Sin ubicación detectada');
              } else {
                if(normalize(stU).indexOf(normalize(selectedState)) === -1 && normalize(selectedState).indexOf(normalize(stU)) === -1){
                  censorTweet(tweetEl, `Ubicación de perfil: ${userLoc}`);
                }
              }
            } else {
              // no info at all
              censorTweet(tweetEl, 'Sin metadata de ubicación detectada');
            }
          } else {
            if(normalize(domSt).indexOf(normalize(selectedState)) === -1 && normalize(selectedState).indexOf(normalize(domSt)) === -1){
              censorTweet(tweetEl, `Detectado por texto: ${domSt}`);
            }
          }
        }
      }
    }catch(e){/*ignore*/}
  }

  function collectTweetElements(root=document){
    const candidates = [];
    const selectors = [
      'article',
      'div[data-testid="tweet"]',
      'div[data-testid="tweetText"]',
      'div[role="article"]'
    ];
    selectors.forEach(sel=>{
      const els = root.querySelectorAll(sel);
      els.forEach(el=>{
        if(el && !el.dataset.__processed_by_region){
          candidates.push(el);
        }
      });
    });
    return candidates;
  }

  async function runOnce(){
    const selectedState = await getSelectedState();
    const tweets = collectTweetElements(document);
    tweets.forEach(t=>{ t.dataset.__processed_by_region = '1'; processTweet(t, selectedState); });
  }

  // Observe DOM for changes (new tweets loaded)
  const mo = new MutationObserver((mutations)=>{
    if(window.__region_filter_throttle) return;
    window.__region_filter_throttle = true;
    setTimeout(async ()=>{
      window.__region_filter_throttle = false;
      const selectedState = await getSelectedState();
      const tweets = collectTweetElements(document);
      tweets.forEach(t=>{ if(!t.dataset.__processed_by_region){ t.dataset.__processed_by_region='1'; processTweet(t, selectedState); } });
    }, 500);
  });
  mo.observe(document, {subtree:true, childList:true});

  // listen to storage changes
  try{
    if(chrome.storage && chrome.storage.onChanged) chrome.storage.onChanged.addListener((changes, area)=>{
      if(area === 'local' && changes.selectedState){
        setTimeout(runOnce, 200);
      }
    });
  }catch(e){}

  // Receive direct messages (from popup) if needed
  try{
    chrome.runtime && chrome.runtime.onMessage && chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
      if(msg && msg.type === 'selectedStateChanged'){
        setTimeout(runOnce, 100);
      }
    });
  }catch(e){}

  // --- Network interception to capture structured tweet/place metadata ---
  try{
    // Intercept fetch
    const _fetch = window.fetch;
    window.fetch = async function(...args){
      const response = await _fetch.apply(this, args);
      // clone and try to parse JSON to find tweets/places
      try{
        const c = response.clone();
        c.json().then(j=>{
          try{ processNetworkJSON(j); }catch(e){}
        }).catch(()=>{});
      }catch(e){}
      return response;
    };

    // Intercept XMLHttpRequest
    const XHR = window.XMLHttpRequest;
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;
    XHR.prototype.open = function(method, url){
      this.__region_filter_url = url;
      return origOpen.apply(this, arguments);
    };
    XHR.prototype.send = function(){
      this.addEventListener('readystatechange', function(){
        try{
          if(this.readyState === 4 && typeof this.responseText === 'string' && this.__region_filter_url && this.__region_filter_url.indexOf('api')!==-1){
            try{
              const txt = this.responseText;
              if(txt && txt.length>0 && txt[0] === '{'){
                const j = JSON.parse(txt);
                processNetworkJSON(j);
              }
            }catch(e){}
          }
        }catch(e){}
      });
      return origSend.apply(this, arguments);
    };
  }catch(e){/* not critical */}

  function processNetworkJSON(obj){
    try{
      // Walk object recursively and find place/full_text/id patterns
      const stack = [obj];
      while(stack.length){
        const cur = stack.pop();
        if(!cur || typeof cur !== 'object') continue;
        // Tweet-like object with id and place or geo
        if((cur.id || cur.tweet_id || cur.status_id) && (cur.place || cur.geo || cur.coordinates || cur.full_text || cur.text)){
          const id = String(cur.id || cur.tweet_id || cur.status_id);
          // prefer place.full_name or place.name or geo
          if(cur.place && (cur.place.full_name || cur.place.name)){
            tweetLocationMap[id] = cur.place.full_name || cur.place.name;
          } else if(cur.user && cur.user.location){
            // user's profile location
            if(cur.user.screen_name) userLocationMap[cur.user.screen_name] = cur.user.location;
            if(cur.user.id_str) userLocationMap[cur.user.id_str] = cur.user.location;
          } else if(cur.geo && cur.geo.coordinates){
            // store lat,lng for future geo resolution (not implemented)
            tweetLocationMap[id] = `${cur.geo.coordinates[0]},${cur.geo.coordinates[1]}`;
          }
        }
        for(const k in cur){
          if(cur.hasOwnProperty(k) && typeof cur[k] === 'object') stack.push(cur[k]);
        }
      }
    }catch(e){}
  }

  // Initial run
  setTimeout(runOnce, 1200);

})();
