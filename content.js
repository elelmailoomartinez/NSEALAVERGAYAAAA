// content.js
// Improved detection with stricter blocking rules and debug mode.
// Blocking only occurs when there's high-confidence structured or DOM-detected state that contradicts the selected state.

(function() {
  const STATES = [
    "Aguascalientes","Baja California","Baja California Sur","Campeche","Chiapas","Chihuahua","Coahuila","Colima","Durango","Guanajuato","Guerrero","Hidalgo","Jalisco","México","Estado de México","Michoacán","Morelos","Nayarit","Nuevo León","Oaxaca","Puebla","Querétaro","Quintana Roo","San Luis Potosí","Sinaloa","Sonora","Tabasco","Tamaulipas","Tlaxcala","Veracruz","Yucatán","Zacatecas","CDMX","Ciudad de México"
  ];

  function normalize(s){
    if(!s) return '';
    let out = String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    out = out.replace(/\s+/g, ' ').trim();
    return out;
  }
  const normalizedStates = STATES.map(s=>normalize(s));

  const STATE_ALIASES = {
    'cdmx':'Ciudad de México',
    'ciudad de mexico':'Ciudad de México',
    'ciudad de méxico':'Ciudad de México',
    'mexico df':'Ciudad de México',
    'df':'Ciudad de México',
    'edo de mexico':'Estado de México',
    'edomex':'Estado de México',
    'estado mexico':'Estado de México',
    'estado de mexico':'Estado de México',
    // NOTE: intentionally do NOT map generic 'mexico' -> Estado de México to avoid country/state confusion
    'nuevo leon':'Nuevo León',
    'nl':'Nuevo León',
    'n.l':'Nuevo León',
    'n.l.':'Nuevo León',
    'nuevo león':'Nuevo León'
  };

  const CITY_TO_STATE = {
    'monterrey': 'Nuevo León',
    'guadalajara': 'Jalisco',
    'zapopan': 'Jalisco',
    'tuxtla gutierrez': 'Chiapas',
    'tijuana': 'Baja California',
    'mexico city': 'Ciudad de México',
    'cdmx': 'Ciudad de México',
    'puebla': 'Puebla',
    'leon': 'Guanajuato',
    'queretaro': 'Querétaro',
    'merida': 'Yucatán',
    'cancun': 'Quintana Roo',
    'veracruz': 'Veracruz',
    'villahermosa': 'Tabasco',
    'oaxaca': 'Oaxaca',
    'morelia': 'Michoacán',
    'toluca': 'Estado de México',
    'celaya': 'Guanajuato',
    'cuernavaca': 'Morelos',
    'saltillo': 'Coahuila',
    'chihuahua': 'Chihuahua',
    'culiacan': 'Sinaloa',
    'mazatlan': 'Sinaloa'
  };

  const tweetLocationMap = {}; // tweetId -> place text
  const userLocationMap = {}; // username -> profile location

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function canonicalStateFromText(text){
    if(!text) return null;
    const nraw = normalize(text);
    const n = nraw.replace(/[\.\-\_\(\)\[\]\/]/g, '').replace(/\s+/g,' ').trim();

    for(const key in STATE_ALIASES){
      if(key && n.indexOf(key) !== -1){
        return STATE_ALIASES[key];
      }
    }

    if(n.indexOf(',')!==-1){
      const parts = n.split(',').map(p=>p.trim()).filter(Boolean);
      if(parts.length){
        const last = parts[parts.length-1];
        for(const key in STATE_ALIASES){ if(last.indexOf(key)!==-1) return STATE_ALIASES[key]; }
        for(let i=0;i<normalizedStates.length;i++){ if(last.indexOf(normalizedStates[i].replace('estado de ', '').replace('estado ', ''))!==-1) return STATES[i]; }
        // penultimate token
        if(parts.length >= 2){
          const pen = parts[parts.length-2];
          for(const key in STATE_ALIASES){ if(pen.indexOf(key)!==-1) return STATE_ALIASES[key]; }
          for(let i=0;i<normalizedStates.length;i++){ if(pen.indexOf(normalizedStates[i].replace('estado de ', '').replace('estado ', ''))!==-1) return STATES[i]; }
        }
      }
    }

    for(const city in CITY_TO_STATE){
      if(n.indexOf(city)!==-1) return CITY_TO_STATE[city];
    }

    for(let i=0;i<normalizedStates.length;i++){
      const key = normalizedStates[i].replace('estado de ', '').replace('estado ', '').trim();
      const re = new RegExp('\\b'+escapeRegExp(key)+'\\b','i');
      if(re.test(n)) return STATES[i];
    }

    return null;
  }

  function extractTweetId(tweetEl){
    try{
      const a = tweetEl.querySelector('a[href*="/status/"]');
      if(a && a.href){
        const m = a.href.match(/status\/(\d+)/);
        if(m && m[1]) return m[1];
      }
      if(tweetEl.dataset && (tweetEl.dataset.tweetId || tweetEl.dataset.itemId)){
        return tweetEl.dataset.tweetId || tweetEl.dataset.itemId;
      }
      const anc = tweetEl.closest('[href]');
      if(anc && anc.href){
        const m = anc.href.match(/status\/(\d+)/);
        if(m && m[1]) return m[1];
      }
    }catch(e){}
    return null;
  }

  function getStructuredLocationForTweet(tweetEl){
    try{
      const id = extractTweetId(tweetEl);
      if(id && tweetLocationMap[id]) return tweetLocationMap[id];
    }catch(e){}
    return null;
  }

  function detectStateForTweetByDOM(tweetEl){
    try{
      const textCandidates = [];
      textCandidates.push(tweetEl.innerText || '');

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

      const anchors = tweetEl.querySelectorAll('a');
      anchors.forEach(a=>{ if(a && a.innerText) textCandidates.push(a.innerText); });

      const smalls = tweetEl.querySelectorAll('span,div');
      for(const s of smalls){
        const txt = s.innerText || s.textContent || '';
        if(txt && txt.length<60 && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(txt)) textCandidates.push(txt);
      }

      for(const t of textCandidates){
        const st = canonicalStateFromText(t);
        if(st) return st;
      }
      return null;
    }catch(e){return null}
  }

  function censorTweet(tweetEl, reason, settings){
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

    if(settings && settings.debug){
      console.warn('region-filter: censored tweet', {reason, settings});
    }
  }

  async function getSettings(){
    return new Promise(resolve => {
      try{
        if(chrome.storage && chrome.storage.local){
          chrome.storage.local.get(['selectedState','debugMode'], res=>{
            resolve({selectedState: res.selectedState || 'Todos', debug: !!res.debugMode});
          });
        } else resolve({selectedState:'Todos', debug:false});
      }catch(e){ resolve({selectedState:'Todos', debug:false}); }
    });
  }

  async function processTweet(tweetEl, settings){
    if(!tweetEl) return;
    try{
      const selectedState = settings.selectedState;
      const debug = settings.debug;

      const tweetId = extractTweetId(tweetEl);
      const structured = getStructuredLocationForTweet(tweetEl);
      const domSt = detectStateForTweetByDOM(tweetEl);

      if(debug) console.debug('region-filter: decision inputs', {tweetId, structured, domSt, selectedState});

      if(selectedState && selectedState !== 'Todos'){
        // High confidence: structured place that canonically maps to a state
        if(structured){
          const structuredState = canonicalStateFromText(structured);
          if(structuredState){
            if(normalize(structuredState) !== normalize(selectedState)){
              censorTweet(tweetEl, `Structured place: ${structured} -> ${structuredState}`, settings);
            }
            return; // structured present -> decision made
          }
          // structured exists but not mappable; do not block immediately, fallback to DOM
        }

        // Medium confidence: DOM detection that yields canonical state (word-boundary match)
        if(domSt){
          if(normalize(domSt) !== normalize(selectedState)){
            censorTweet(tweetEl, `DOM-detected state: ${domSt}`, settings);
          }
          return;
        }

        // Low confidence: user profile location (only if explicit mapping)
        let username = null;
        try{
          const profileLink = tweetEl.querySelector('a[href^="/"]');
          if(profileLink && profileLink.getAttribute('href')){
            const m = profileLink.getAttribute('href').match(/^\/(?!home)([^/]+)\/?$/);
            if(m && m[1]) username = m[1];
          }
        }catch(e){}
        const userLoc = username && userLocationMap[username] ? userLocationMap[username] : null;
        if(userLoc){
          const stU = canonicalStateFromText(userLoc);
          if(stU && normalize(stU) !== normalize(selectedState)){
            censorTweet(tweetEl, `Profile location: ${userLoc} -> ${stU}`, settings);
          }
          return;
        }

        // No reliable info: do not censor (reduce false positives)
        if(debug) console.debug('region-filter: no reliable location info, skipping censor', {tweetId});
      }
    }catch(e){ if(settings && settings.debug) console.error('region-filter: error in processTweet', e); }
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
    const settings = await getSettings();
    const tweets = collectTweetElements(document);
    tweets.forEach(t=>{ t.dataset.__processed_by_region = '1'; processTweet(t, settings); });
  }

  const mo = new MutationObserver((mutations)=>{
    if(window.__region_filter_throttle) return;
    window.__region_filter_throttle = true;
    setTimeout(async ()=>{
      window.__region_filter_throttle = false;
      const settings = await getSettings();
      const tweets = collectTweetElements(document);
      tweets.forEach(t=>{ if(!t.dataset.__processed_by_region){ t.dataset.__processed_by_region='1'; processTweet(t, settings); } });
    }, 500);
  });
  mo.observe(document, {subtree:true, childList:true});

  try{
    if(chrome.storage && chrome.storage.onChanged) chrome.storage.onChanged.addListener((changes, area)=>{
      if(area === 'local' && (changes.selectedState || changes.debugMode)){
        setTimeout(runOnce, 200);
      }
    });
  }catch(e){}

  try{
    chrome.runtime && chrome.runtime.onMessage && chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
      if(msg && msg.type === 'selectedStateChanged'){
        setTimeout(runOnce, 100);
      }
    });
  }catch(e){}

  try{
    const _fetch = window.fetch;
    window.fetch = async function(...args){
      const response = await _fetch.apply(this, args);
      try{
        const c = response.clone();
        c.json().then(j=>{ try{ processNetworkJSON(j); }catch(e){} }).catch(()=>{});
      }catch(e){}
      return response;
    };

    const XHR = window.XMLHttpRequest;
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;
    XHR.prototype.open = function(method, url){ this.__region_filter_url = url; return origOpen.apply(this, arguments); };
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
  }catch(e){}

  function processNetworkJSON(obj){
    try{
      const stack = [obj];
      while(stack.length){
        const cur = stack.pop();
        if(!cur || typeof cur !== 'object') continue;
        if((cur.id || cur.tweet_id || cur.status_id) && (cur.place || cur.geo || cur.coordinates || cur.full_text || cur.text)){
          const id = String(cur.id || cur.tweet_id || cur.status_id);
          if(cur.place && (cur.place.full_name || cur.place.name)){
            tweetLocationMap[id] = cur.place.full_name || cur.place.name;
          } else if(cur.user && cur.user.location){
            if(cur.user.screen_name) userLocationMap[cur.user.screen_name] = cur.user.location;
            if(cur.user.id_str) userLocationMap[cur.user.id_str] = cur.user.location;
          } else if(cur.geo && cur.geo.coordinates){
            tweetLocationMap[id] = `${cur.geo.coordinates[0]},${cur.geo.coordinates[1]}`;
          }
        }
        for(const k in cur){ if(cur.hasOwnProperty(k) && typeof cur[k] === 'object') stack.push(cur[k]); }
      }
    }catch(e){}
  }

  setTimeout(runOnce, 1200);

})();
