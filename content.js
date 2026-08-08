// content.js
// Simple scraping content script: collects page title and paragraphs and sends to background script
(function() {
  try {
    const data = {
      url: window.location.href,
      title: document.title,
      paragraphs: Array.from(document.querySelectorAll('p')).map(p => p.innerText).slice(0,50)
    };
    // Send data to background for processing/storage
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({type: 'scraped-data', payload: data}, response => {
        // optional callback
        // console.log('Background response:', response);
      });
    } else if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
      browser.runtime.sendMessage({type: 'scraped-data', payload: data}).catch(()=>{});
    } else {
      // Fallback: log to console
      console.log('Scraped data:', data);
    }
  } catch (err) {
    console.error('content.js scrape error', err);
  }
})();
