chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'UPDATE_BADGE') {
    return;
  }

  if (!sender.tab || typeof sender.tab.id !== 'number') {
    return;
  }

  const tabId = sender.tab.id;
  const text = String(message.text || '');

  chrome.action.setBadgeText({ tabId, text }).catch(() => {});

  if (message.color) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: message.color }).catch(() => {});
  }
});
