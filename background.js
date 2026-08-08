// background.js
// Minimal background service worker: listens for messages from content and logs
self.addEventListener('message', ()=>{});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if(!message) return;
  if(message.type === 'scraped-data'){
    // Keep behaviour: store or log scraped payload
    try{
      const payload = message.payload || {};
      console.log('Background: received scraped payload', payload);
      // store one-off in local storage for now
      const key = 'scraped:' + (payload.url || Date.now());
      const obj = {};
      obj[key] = payload;
      chrome.storage.local.set(obj, ()=>{});
    }catch(e){}
    sendResponse({status:'ok'});
  }
  if(message.type === 'region-filter-ready'){
    // could perform background tasks
    sendResponse({status:'ready'});
  }
});
