(() => {
  const AMEX_OFFERS_URL = 'https://global.americanexpress.com/offers';

  const offerCountEl = document.getElementById('offerCount');
  const offerSubtextEl = document.getElementById('offerSubtext');
  const progressWrapEl = document.getElementById('progressWrap');
  const progressBarEl = document.getElementById('progressBar');
  const progressTextEl = document.getElementById('progressText');
  const skipBonusEl = document.getElementById('skipBonus');
  const addAllBtn = document.getElementById('addAll');
  const refreshBtn = document.getElementById('refreshBtn');
  const openAmexLinkBtn = document.getElementById('openAmexLink');
  const summaryMsgEl = document.getElementById('summaryMsg');

  let activeTabId = null;
  let activeTabUrl = '';
  let isCurrentlyRunning = false;
  let loadingPollTimer = null;

  function isInjectableUrl(url) {
    if (typeof url !== 'string' || !url) {
      return false;
    }
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== 'https:' &&
        parsed.protocol !== 'http:' &&
        parsed.protocol !== 'file:'
      ) {
        return false;
      }
      if (
        url.startsWith('https://chrome.google.com/webstore') ||
        url.startsWith('https://chromewebstore.google.com')
      ) {
        return false;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function stopLoadingPoll() {
    if (loadingPollTimer !== null) {
      clearInterval(loadingPollTimer);
      loadingPollTimer = null;
    }
  }

  function startLoadingPoll() {
    if (loadingPollTimer === null) {
      loadingPollTimer = setInterval(() => {
        void refreshStatus();
      }, 1000);
    }
  }

  function renderRestrictedState(reason) {
    stopLoadingPoll();
    isCurrentlyRunning = false;
    offerCountEl.textContent = 'Cannot run on this page';
    offerSubtextEl.textContent =
      reason || 'Open American Express Offers & Benefits to add offers.';
    progressWrapEl.hidden = true;
    addAllBtn.textContent = 'Add All Offers';
    addAllBtn.classList.remove('stop');
    addAllBtn.disabled = true;
    skipBonusEl.disabled = false;
    openAmexLinkBtn.hidden = false;
    summaryMsgEl.hidden = true;
  }

  function renderStatus(status) {
    if (!status) {
      renderRestrictedState('Unable to read page status.');
      return;
    }

    isCurrentlyRunning = Boolean(status.running);

    if (status.isOffersLoading && status.availableCount === 0 && !status.running) {
      startLoadingPoll();
    } else {
      stopLoadingPoll();
    }

    if (status.running) {
      offerCountEl.textContent = 'Adding offers...';
      offerSubtextEl.textContent =
        status.skippedCount > 0
          ? `${status.skippedCount} skipped (Bonus MR Points)`
          : 'Keep this tab open while offers are added.';

      const total = status.totalToAdd || 0;
      const added = status.addedCount || 0;
      const pct = total > 0 ? Math.min(100, Math.round((added / total) * 100)) : 0;
      progressWrapEl.hidden = false;
      progressBarEl.style.width = `${pct}%`;
      progressTextEl.textContent = status.currentOfferTitle
        ? `Adding ${added} / ${total}: ${status.currentOfferTitle}`
        : `Adding ${added} / ${total}...`;

      addAllBtn.textContent = 'Stop';
      addAllBtn.classList.add('stop');
      addAllBtn.disabled = false;
      skipBonusEl.disabled = true;
      openAmexLinkBtn.hidden = true;
      summaryMsgEl.hidden = true;
      return;
    }

    progressWrapEl.hidden = true;
    progressBarEl.style.width = '0%';
    progressTextEl.textContent = '';
    addAllBtn.textContent = 'Add All Offers';
    addAllBtn.classList.remove('stop');
    skipBonusEl.disabled = false;

    if (status.availableCount > 0) {
      offerCountEl.textContent =
        status.availableCount === 1
          ? '1 offer available'
          : `${status.availableCount} offers available`;
      const parts = [];
      if (status.skippedCount > 0) {
        parts.push(`${status.skippedCount} skipped (Bonus MR Points)`);
      }
      if (status.failedCount > 0) {
        parts.push(`${status.failedCount} failed (Try Again available)`);
      }
      offerSubtextEl.textContent = parts.join(' • ');
      addAllBtn.disabled = false;
      openAmexLinkBtn.hidden = true;
    } else if (status.isOffersLoading) {
      offerCountEl.textContent = 'Loading Amex offers...';
      offerSubtextEl.textContent = 'Waiting for offers to finish loading.';
      addAllBtn.disabled = true;
      openAmexLinkBtn.hidden = true;
    } else if (!status.isAmexPage) {
      offerCountEl.textContent = 'No offers found on this page';
      offerSubtextEl.textContent = 'Open American Express Offers & Benefits to add offers.';
      addAllBtn.disabled = true;
      openAmexLinkBtn.hidden = false;
    } else {
      offerCountEl.textContent = 'No available offers found';
      if (status.skippedCount > 0) {
        offerSubtextEl.textContent = `${status.skippedCount} skipped (Bonus MR Points)`;
      } else if (status.failedCount > 0) {
        offerSubtextEl.textContent = `${status.failedCount} failed — click Try Again on the page.`;
      } else {
        offerSubtextEl.textContent = 'All eligible offers on this page are already added.';
      }
      addAllBtn.disabled = true;
      openAmexLinkBtn.hidden = true;
    }

    if (status.lastSummary) {
      const isWarn =
        status.failedCount > 0 ||
        status.lastSummary.startsWith('Stopped') ||
        status.lastSummary.startsWith('No available');
      summaryMsgEl.textContent = status.lastSummary;
      summaryMsgEl.className = isWarn ? 'summary warn' : 'summary success';
      summaryMsgEl.hidden = false;
    } else {
      summaryMsgEl.hidden = true;
    }
  }

  async function sendToTab(tabId, tabUrl, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (firstErr) {
      if (!isInjectableUrl(tabUrl)) {
        const restrictedErr = new Error('RESTRICTED_URL');
        restrictedErr.cause = firstErr;
        throw restrictedErr;
      }

      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      return await chrome.tabs.sendMessage(tabId, message);
    }
  }

  async function refreshStatus() {
    if (typeof activeTabId !== 'number') {
      renderRestrictedState('No active browser tab found.');
      return;
    }

    try {
      const response = await sendToTab(activeTabId, activeTabUrl, {
        type: 'GET_STATUS',
        skipBonusPoints: skipBonusEl.checked,
      });
      if (response && response.ok) {
        renderStatus(response.status);
      } else {
        renderRestrictedState('Unable to inspect this tab.');
      }
    } catch (err) {
      if (err && err.message === 'RESTRICTED_URL') {
        renderRestrictedState();
      } else {
        renderRestrictedState('Unable to inspect this tab.');
      }
    }
  }

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (!message || message.type !== 'STATUS_UPDATE' || !message.status) {
      return;
    }
    if (sender && sender.tab && typeof activeTabId === 'number' && sender.tab.id !== activeTabId) {
      return;
    }
    renderStatus(message.status);
  });

  addAllBtn.addEventListener('click', async () => {
    if (typeof activeTabId !== 'number') {
      return;
    }
    const msg = isCurrentlyRunning
      ? { type: 'STOP_ADDING' }
      : { type: 'START_ADDING', skipBonusPoints: skipBonusEl.checked };

    try {
      const response = await sendToTab(activeTabId, activeTabUrl, msg);
      if (response && response.ok) {
        renderStatus(response.status);
      }
    } catch (_) {
      renderRestrictedState('Unable to communicate with this tab.');
    }
  });

  refreshBtn.addEventListener('click', () => {
    void refreshStatus();
  });

  skipBonusEl.addEventListener('change', async () => {
    try {
      await chrome.storage.local.set({ skipBonusPoints: skipBonusEl.checked });
    } catch (_) {}
    void refreshStatus();
  });

  openAmexLinkBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: AMEX_OFFERS_URL });
  });

  window.addEventListener('unload', () => {
    stopLoadingPoll();
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const stored = await chrome.storage.local.get({ skipBonusPoints: true });
      skipBonusEl.checked = Boolean(stored.skipBonusPoints);
    } catch (_) {
      skipBonusEl.checked = true;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || typeof tab.id !== 'number') {
        renderRestrictedState('No active browser tab found.');
        return;
      }
      activeTabId = tab.id;
      activeTabUrl = tab.url || '';

      if (!isInjectableUrl(activeTabUrl)) {
        renderRestrictedState();
        return;
      }

      await refreshStatus();
    } catch (_) {
      renderRestrictedState('Unable to inspect active tab.');
    }
  });
})();
