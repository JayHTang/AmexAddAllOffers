(() => {
  if (window.__amexOfferAdderInitialized) {
    return;
  }
  window.__amexOfferAdderInitialized = true;

  const PRIMARY_BUTTON_SELECTOR = [
    'button[data-testid="enrollPlusButton"]',
    'button[data-testid="merchantOfferListAddButton"]',
    'button[title="add to card" i]',
    'button[title="add to list card" i]',
    'button[aria-label^="Add to card" i]',
  ].join(', ');

  const MODAL_BUTTON_SELECTOR = 'button[data-testid="addToCardBtn"]';
  const ALL_BUTTON_SELECTOR = `${PRIMARY_BUTTON_SELECTOR}, ${MODAL_BUTTON_SELECTOR}`;
  const SPINNER_SELECTOR =
    '[data-testid="progressCircle"], [data-testid="progressCircularListView"]';
  const LOADING_SELECTOR =
    '[data-testid="offers-loading"], [data-testid="recommendedOffersLoading"]';
  const RETRY_BUTTON_SELECTOR = '[data-testid="merchantOfferTryAgainButton"]';
  const EXCLUDED_ANCESTOR_SELECTOR = [
    '[hidden]',
    '[aria-hidden="true"]',
    '[data-testid="addedToCardContainer"]',
    '[data-testid="addedToCardViewAllContainer"]',
  ].join(', ');
  const STOP_CONTAINER_SELECTOR = [
    '[data-testid="gridViewContainer"]',
    '[data-testid="listViewContainer"]',
    '[data-testid="recommendedOffersContainer"]',
    'main',
    'body',
  ].join(', ');

  const DEFAULT_DELAY_MS = 1000;
  const DEFAULT_JITTER_MS = 400;
  const SPINNER_TIMEOUT_MS = 10000;

  const state = {
    running: false,
    cancelled: false,
    skipBonusPoints: true,
    addedCount: 0,
    totalToAdd: 0,
    currentOfferTitle: '',
    lastSummary: '',
  };

  let activeClickedButtons = null;

  function isActionableButton(btn) {
    if (!btn || !btn.isConnected) {
      return false;
    }
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
      return false;
    }
    if (btn.closest(EXCLUDED_ANCESTOR_SELECTOR)) {
      return false;
    }
    const style = window.getComputedStyle(btn);
    if (!style || style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    return true;
  }

  function findOfferButtons(root = document) {
    const primary = Array.from(root.querySelectorAll(PRIMARY_BUTTON_SELECTOR)).filter(
      isActionableButton
    );
    if (primary.length > 0) {
      return primary;
    }
    return Array.from(root.querySelectorAll(MODAL_BUTTON_SELECTOR)).filter(isActionableButton);
  }

  function getOfferTitle(button) {
    if (!button) {
      return '';
    }

    let el = button.parentElement;
    let cardContainer = null;

    for (let depth = 0; depth < 8 && el; depth += 1) {
      if (el.matches(STOP_CONTAINER_SELECTOR)) {
        break;
      }
      if (el.querySelectorAll(ALL_BUTTON_SELECTOR).length > 1) {
        break;
      }
      cardContainer = el;
      el = el.parentElement;
    }

    if (cardContainer) {
      const heading = cardContainer.querySelector('h3, h2, [role="heading"]');
      if (heading) {
        const text = (heading.textContent || '').trim().replace(/\s+/g, ' ');
        if (text) {
          return text;
        }
      }
    }

    return (button.getAttribute('aria-label') || '')
      .replace(/^add to card offer:\s*/i, '')
      .trim();
  }

  function shouldSkipOffer(button, title, skipBonusPoints = true) {
    if (!skipBonusPoints) {
      return false;
    }
    const aria = (button.getAttribute('aria-label') || '').trim().toLowerCase();
    const normTitle = (title || '').trim().toLowerCase();
    return (
      aria === 'add to card offer: bonus membership rewards points offer' ||
      normTitle === 'bonus membership rewards points offer'
    );
  }

  function scanOffers(skipBonusPoints = true, clickedSet = null) {
    const buttons = findOfferButtons(document);
    const eligible = [];
    const skipped = [];

    for (const btn of buttons) {
      if (clickedSet && clickedSet.has(btn)) {
        continue;
      }
      const title = getOfferTitle(btn);
      if (shouldSkipOffer(btn, title, skipBonusPoints)) {
        skipped.push(btn);
      } else {
        eligible.push(btn);
      }
    }

    const failedCount = Array.from(document.querySelectorAll(RETRY_BUTTON_SELECTOR)).filter(
      isActionableButton
    ).length;
    const isOffersLoading = Boolean(document.querySelector(LOADING_SELECTOR));

    return {
      eligible,
      skipped,
      availableCount: eligible.length,
      skippedCount: skipped.length,
      failedCount,
      isOffersLoading,
    };
  }

  function getStatusSnapshot(skipBonusPointsOverride) {
    const skip =
      typeof skipBonusPointsOverride === 'boolean'
        ? skipBonusPointsOverride
        : state.skipBonusPoints;
    const scan = scanOffers(skip, state.running ? activeClickedButtons : null);

    return {
      running: state.running,
      availableCount: scan.availableCount,
      skippedCount: scan.skippedCount,
      failedCount: scan.failedCount,
      isOffersLoading: scan.isOffersLoading,
      addedCount: state.addedCount,
      totalToAdd: state.totalToAdd,
      currentOfferTitle: state.currentOfferTitle,
      lastSummary: state.lastSummary,
      isAmexPage: /\.americanexpress\.com$/i.test(window.location.hostname),
    };
  }

  function safeSendRuntimeMessage(payload) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        const maybePromise = chrome.runtime.sendMessage(payload);
        if (maybePromise && typeof maybePromise.catch === 'function') {
          maybePromise.catch(() => {});
        }
      }
    } catch (_) {}
  }

  function syncBadge(status) {
    let text = '';
    let color = '#006fcf';

    if (status.running) {
      text = String(Math.max(status.totalToAdd - status.addedCount, 1));
      color = '#006fcf';
    } else if (status.lastSummary && status.availableCount === 0 && status.addedCount > 0) {
      text = '✓';
      color = '#198754';
    } else if (status.availableCount > 0) {
      text = status.availableCount > 999 ? '999+' : String(status.availableCount);
      color = '#006fcf';
    }

    safeSendRuntimeMessage({ type: 'UPDATE_BADGE', text, color });
  }

  function broadcastStatus(snapshotOverride) {
    const status = snapshotOverride || getStatusSnapshot(state.skipBonusPoints);
    syncBadge(status);
    safeSendRuntimeMessage({ type: 'STATUS_UPDATE', status });
    return status;
  }

  function cancellableSleep(ms) {
    return new Promise((resolve) => {
      if (ms <= 0 || state.cancelled) {
        resolve();
        return;
      }
      const start = Date.now();
      const step = Math.min(100, ms);
      const timer = setInterval(() => {
        if (state.cancelled || Date.now() - start >= ms) {
          clearInterval(timer);
          resolve();
        }
      }, step);
    });
  }

  async function waitForSpinnerToClear(timeoutMs = SPINNER_TIMEOUT_MS) {
    const start = Date.now();
    while (!state.cancelled && Date.now() - start < timeoutMs) {
      if (!document.querySelector(SPINNER_SELECTOR)) {
        return;
      }
      await cancellableSleep(100);
    }
  }

  async function startAddingOffers({
    skipBonusPoints = true,
    delayMs = DEFAULT_DELAY_MS,
    jitterMs = DEFAULT_JITTER_MS,
  } = {}) {
    if (state.running) {
      return getStatusSnapshot();
    }

    const initial = scanOffers(skipBonusPoints, null);
    if (initial.availableCount === 0) {
      state.skipBonusPoints = skipBonusPoints;
      state.addedCount = 0;
      state.totalToAdd = 0;
      state.currentOfferTitle = '';
      state.lastSummary = 'No available offers to add.';
      return broadcastStatus();
    }

    activeClickedButtons = new WeakSet();
    state.running = true;
    state.cancelled = false;
    state.skipBonusPoints = skipBonusPoints;
    state.addedCount = 0;
    state.totalToAdd = initial.availableCount;
    state.currentOfferTitle = '';
    state.lastSummary = '';

    broadcastStatus();

    try {
      while (!state.cancelled) {
        const { eligible } = scanOffers(state.skipBonusPoints, activeClickedButtons);
        if (eligible.length === 0) {
          break;
        }

        const btn = eligible[0];
        const title = getOfferTitle(btn);
        activeClickedButtons.add(btn);
        state.currentOfferTitle = title;
        broadcastStatus();

        try {
          btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (_) {}

        btn.click();
        state.addedCount += 1;
        broadcastStatus();

        // Allow React a brief moment to mount any enrollment spinner before checking
        await cancellableSleep(50);
        if (!state.cancelled) {
          await waitForSpinnerToClear();
        }

        if (!state.cancelled) {
          const remaining = scanOffers(state.skipBonusPoints, activeClickedButtons).eligible.length;
          if (remaining > 0 && delayMs > 0) {
            const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
            await cancellableSleep(delayMs + jitter);
          }
        }
      }
    } finally {
      const wasCancelled = state.cancelled;
      state.running = false;
      state.cancelled = false;
      state.currentOfferTitle = '';
      activeClickedButtons = null;

      const finalScan = getStatusSnapshot(state.skipBonusPoints);
      if (wasCancelled) {
        state.lastSummary = `Stopped after adding ${state.addedCount} of ${state.totalToAdd} offers.`;
      } else if (finalScan.failedCount > 0) {
        state.lastSummary = `Added ${state.addedCount} offers (${finalScan.failedCount} failed — click Try Again on the page).`;
      } else {
        state.lastSummary = `Done! Added ${state.addedCount} ${
          state.addedCount === 1 ? 'offer' : 'offers'
        }.`;
      }

      broadcastStatus(getStatusSnapshot(state.skipBonusPoints));
    }

    return getStatusSnapshot(state.skipBonusPoints);
  }

  function stopAddingOffers() {
    if (state.running) {
      state.cancelled = true;
    }
    return broadcastStatus();
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message.type !== 'string') {
        return false;
      }

      if (message.type === 'GET_STATUS') {
        if (!state.running && typeof message.skipBonusPoints === 'boolean') {
          state.skipBonusPoints = message.skipBonusPoints;
        }
        const status = getStatusSnapshot(state.skipBonusPoints);
        syncBadge(status);
        sendResponse({ ok: true, status });
        return false;
      }

      if (message.type === 'START_ADDING') {
        if (!state.running) {
          const skip =
            typeof message.skipBonusPoints === 'boolean'
              ? message.skipBonusPoints
              : state.skipBonusPoints;
          void startAddingOffers({ skipBonusPoints: skip });
        }
        sendResponse({ ok: true, status: getStatusSnapshot(state.skipBonusPoints) });
        return false;
      }

      if (message.type === 'STOP_ADDING') {
        const status = stopAddingOffers();
        sendResponse({ ok: true, status });
        return false;
      }

      return false;
    });
  }

  function setupObserver() {
    if (!/\.americanexpress\.com$/i.test(window.location.hostname)) {
      return;
    }

    let debounceTimer = null;
    const updateIdleBadge = () => {
      if (state.running) {
        return;
      }
      const status = getStatusSnapshot(state.skipBonusPoints);
      if (state.lastSummary && status.availableCount > 0) {
        state.lastSummary = '';
        status.lastSummary = '';
      }
      syncBadge(status);
    };

    const observer = new MutationObserver(() => {
      if (state.running) {
        return;
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(updateIdleBadge, 500);
    });

    const attach = () => {
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
        updateIdleBadge();
      }
    };

    if (document.body) {
      attach();
    } else {
      window.addEventListener('DOMContentLoaded', attach, { once: true });
    }
  }

  setupObserver();

  window.__amexOfferAdder = {
    findOfferButtons,
    getOfferTitle,
    shouldSkipOffer,
    scanOffers,
    getStatusSnapshot,
    startAddingOffers,
    stopAddingOffers,
  };
})();
