"use strict";

/*
 * Responsive Test Cache Cleaner
 * ------------------------------
 * Keeps the browser cache empty while you do responsive-design testing,
 * so every reload/resize always fetches fresh CSS/JS/images instead of
 * showing a stale cached version.
 *
 * Two independent mechanisms, both optional:
 *   1. A timer (browser.alarms) that clears the cache every N seconds.
 *   2. A "clear right before every navigation" hook (webNavigation),
 *      so every reload/refresh you trigger is guaranteed fresh.
 *
 * Settings are persisted with browser.storage.local and controlled from
 * the popup (popup.html/popup.js).
 */

const DEFAULT_SETTINGS = {
  enabled: true, // master on/off switch
  intervalSeconds: 5, // periodic clear interval
  clearOnNavigate: true, // clear right before each page load/reload
  extraClear: false, // also wipe cookies + local/site storage (heavier, use if you also need to reset app state)
  sinceMs: 0 // browsingData "since" - 0 = beginning of time (clears everything)
};

let settings = { ...DEFAULT_SETTINGS };
let lastClearAt = 0;

function buildRemovalOptions() {
  const dataToRemove = { cache: true };
  if (settings.extraClear) {
    dataToRemove.cookies = true;
    dataToRemove.localStorage = true;
    dataToRemove.indexedDB = true;
    dataToRemove.serviceWorkers = true;
  }
  return dataToRemove;
}

async function clearCacheNow(reason) {
  try {
    await browser.browsingData.remove(
      { since: settings.sinceMs || 0 },
      buildRemovalOptions()
    );
    lastClearAt = Date.now();
    await browser.storage.local.set({ lastClearAt, lastClearReason: reason || "manual" });
    return true;
  } catch (err) {
    console.error("Cache Cleaner: failed to clear browsing data", err);
    return false;
  }
}

async function loadSettings() {
  const stored = await browser.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  settings = { ...DEFAULT_SETTINGS, ...stored };
}

async function applyAlarm() {
  await browser.alarms.clear("periodic-clear");
  if (settings.enabled && settings.intervalSeconds > 0) {
    browser.alarms.create("periodic-clear", {
      periodInMinutes: Math.max(settings.intervalSeconds / 60, 1 / 60) // alarms API works in minutes
    });
  }
}

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "periodic-clear" && settings.enabled) {
    clearCacheNow("interval");
  }
});

// Clear right before a page (re)loads, so the very next request is guaranteed fresh.
browser.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return; // top-level frames only
  if (settings.enabled && settings.clearOnNavigate) {
    clearCacheNow("navigate");
  }
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || typeof message !== "object") return;

    if (message.type === "GET_STATE") {
      sendResponse({ settings, lastClearAt });
      return;
    }

    if (message.type === "UPDATE_SETTINGS") {
      settings = { ...settings, ...message.settings };
      await browser.storage.local.set(settings);
      await applyAlarm();
      sendResponse({ settings, lastClearAt });
      return;
    }

    if (message.type === "CLEAR_NOW") {
      const ok = await clearCacheNow("manual");
      sendResponse({ ok, lastClearAt });
      return;
    }
  })();
  return true; // keep the message channel open for the async response
});

(async () => {
  await loadSettings();
  await applyAlarm();
})();
