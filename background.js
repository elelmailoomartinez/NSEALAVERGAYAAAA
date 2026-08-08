// background.js
// Receives messages from content scripts and logs or stores them
(function() {
  function handleMessage(message, sender, sendResponse) {
    if (!message || !message.type) return;
    if (message.type === 'scraped-data') {
      const payload = message.payload || {};
      // For now, just log. In production you might POST to a server or save to storage.
      console.log('Received scraped data from', sender && sender.tab ? sender.tab.url : sender, payload);
      // Optionally store in local storage
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          const key = 'scraped:' + (payload.url || Date.now());
          const obj = {};
          obj[key] = payload;
          chrome.storage.local.set(obj, () => {});
        }
      } catch (e) {
        // ignore storage errors
      }
      sendResponse({status: 'ok'});
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      handleMessage(message, sender, sendResponse);
      // Return true to indicate async response if needed
      return true;
    });
  } else if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.onMessage) {
    browser.runtime.onMessage.addListener((message, sender) => {
      handleMessage(message, sender, () => {});
    });
  }
})();
