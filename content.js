// content.js
// Monitors tweets on Twitter/X and censors those that are not from the selected Mexican state.
(function() {
  const STATES = [
    "Aguascalientes","Baja California","Baja California Sur","Campeche","Chiapas","Chihuahua","Coahuila","Colima","Durango","Guanajuato","Guerrero","Hidalgo","Jalisco","México","Estado de México","Michoacán","Morelos","Nayarit","Nuevo León","Oaxaca","Puebla","Querétaro","Quintana Roo","San Luis Potosí","Sinaloa","Sonora","Tabasco","Tamaulipas","Tlaxcala","Veracruz","Yucatán","Zacatecas","CDMX","Ciudad de México"
  ];

  function normalize(s){
    if(!s) return '';
    return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  }
  const normalizedStates = STATES.map(s=>normalize(s));

  // read selected state from storage
  async function getSelectedState(){
    return new Promise(resolve => {
      try{
        chrome.storage && chrome.storage.local ? chrome.storage.local.get(['selectedState'], res => resolve(res.selectedState || null)) : resolve(null);
      }catch(e){resolve(null)}
    });
  }

  function matchStateInText(text){
    if(!text) return null;
    const n = normalize(text);
    for(let i=0;i<normalizedStates.length;i++){
      if(n.includes(normalizedStates[i].replace('estado de ', '').replace('estado ', '')) || n.includes(normalizedStates[i].replace('estado de ', '').replace('estado ', '')) ) return STATES[i];
    }
    return null;
  }

  // Determine if a tweet element is from a given state
  function detectStateForTweet(tweetEl){
    try{
      // Search within tweet for any text that mentions a state or a location icon followed by text
      const textCandidates = [];
      // All text inside tweet
      textCandidates.push(tweetEl.innerText || '');
      // Specific selectors that may contain location or profile location
      const locSelectors = [
        'a[aria-label*="Location"]',
        'svg[aria-label="Location"]',
        '[data-testid="User-Name"]',
        '[data-testid="UserDescription"]',
        'div[dir="auto"]'
      ];
      locSelectors.forEach(sel=>{
        const el = tweetEl.querySelector(sel);
        if(el) textCandidates.push(el.innerText || el.textContent || '');
      });
      // Try to find place strings like "Ciudad de México, Mexico" inside anchors
      const anchors = tweetEl.querySelectorAll('a');
      anchors.forEach(a=>{ if(a && a.innerText) textCandidates.push(a.innerText); });

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
    // Hide content and show overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'background:#111;color:#fff;padding:12px;border-radius:6px;text-align:center;cursor:pointer;';
    overlay.innerText = 'Tweet bloqueado: no corresponde a la región seleccionada. Hacer clic para mostrar.';
    overlay.title = reason || 'Bloqueado por filtro de región';
    overlay.addEventListener('click', ()=>{
      // toggle reveal
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

    // Wrap existing tweet content
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';

    // Move children into a content container
    const contentContainer = document.createElement('div');
    while(tweetEl.firstChild){
      contentContainer.appendChild(tweetEl.firstChild);
    }
    // hide content by default
    contentContainer.style.display = 'none';

    tweetEl.appendChild(overlay);
    tweetEl.appendChild(contentContainer);
  }

  async function processTweet(tweetEl, selectedState){
    if(!tweetEl) return;
    try{
      const detected = detectStateForTweet(tweetEl);
      if(selectedState && selectedState !== 'Todos'){
        if(!detected){
          censorTweet(tweetEl, 'Sin metadata de ubicación detectada');
        } else {
          // compare normalized
          if(normalize(detected).indexOf(normalize(selectedState)) === -1 && normalize(selectedState).indexOf(normalize(detected)) === -1){
            censorTweet(tweetEl, `Detectado: ${detected}`);
          }
        }
      } else {
        // no filtering
      }
    }catch(e){/*ignore*/}
  }

  // Find tweet elements on the page. selectors are heuristic and try to catch different UI versions.
  function collectTweetElements(root=document){
    const candidates = [];
    // common tweet containers
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
    // throttle
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

  // initial run after short delay for dynamic content
  setTimeout(runOnce, 1200);

  // listen to storage changes (when user changes selected state via popup)
  try{
    chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.addListener((changes, area)=>{
      if(area === 'local' && changes.selectedState){
        // re-scan the page quickly
        setTimeout(runOnce, 200);
      }
    });
  }catch(e){}

  // keep scraping data to background if desired
  try{
    // Send a small heartbeat to background
    if(chrome && chrome.runtime && chrome.runtime.sendMessage){
      chrome.runtime.sendMessage({type:'region-filter-ready'});
    }
  }catch(e){}

})();
