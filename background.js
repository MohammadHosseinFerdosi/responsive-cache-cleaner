"use strict";

import {
  DEFAULT_SETTINGS,
  applySettingsPatch,
  mergeSettings
} from "./lib/settings.js";
import {
  buildRemovalFilter,
  parseHttpUrl,
  shouldClearForUrl
} from "./lib/scope.js";
import { planClear, planHasWork } from "./lib/clear-types.js";

const ALARM_NAME = "periodic-clear";

/** @type {ReturnType<typeof mergeSettings>} */
let settings = mergeSettings(DEFAULT_SETTINGS);
let lastClearAt = 0;
let lastClearReason = "";
let lastError = "";
let clearInFlight = null;

function api() {
  return typeof browser !== "undefined" ? browser : chrome;
}

async function persistState(extra = {}) {
  await api().storage.local.set({
    lastClearAt,
    lastClearReason,
    lastError,
    ...extra
  });
}

async function loadSettings() {
  const stored = await api().storage.local.get([
    ...Object.keys(DEFAULT_SETTINGS),
    "lastClearAt",
    "lastClearReason",
    "lastError"
  ]);
  settings = mergeSettings(stored);
  lastClearAt = Number(stored.lastClearAt) || 0;
  lastClearReason = stored.lastClearReason || "";
  lastError = stored.lastError || "";
}

async function applyAlarm() {
  await api().alarms.clear(ALARM_NAME);
  if (settings.enabled && settings.intervalSeconds > 0) {
    // alarms API unit is minutes; Firefox allows fractional minutes.
    const periodInMinutes = Math.max(settings.intervalSeconds / 60, 1 / 60);
    api().alarms.create(ALARM_NAME, { periodInMinutes });
  }
}

async function updateBadge() {
  const action = api().action || api().browserAction;
  if (!action?.setBadgeText) return;
  try {
    if (!settings.enabled) {
      await action.setBadgeText({ text: "off" });
      await action.setBadgeBackgroundColor({ color: "#6b6b70" });
      return;
    }
    await action.setBadgeText({ text: "ON" });
    await action.setBadgeBackgroundColor({ color: "#0b6e4f" });
  } catch {
    // Badge APIs are best-effort.
  }
}

async function getActiveTab() {
  const tabs = await api().tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function injectPageClear(tabId, { cacheStorage, serviceWorkers }) {
  if (!tabId || (!cacheStorage && !serviceWorkers)) return { cacheKeys: 0, swUnregistered: 0 };

  const results = await api().scripting.executeScript({
    target: { tabId, allFrames: false },
    func: async (doCache, doSw) => {
      let cacheKeys = 0;
      let swUnregistered = 0;
      try {
        if (doCache && "caches" in globalThis) {
          const keys = await caches.keys();
          cacheKeys = keys.length;
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch (err) {
        console.warn("RCC inject cache storage failed", err);
      }
      try {
        if (doSw && navigator.serviceWorker?.getRegistrations) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            regs.map(async (r) => {
              const ok = await r.unregister();
              if (ok) swUnregistered += 1;
            })
          );
        }
      } catch (err) {
        console.warn("RCC inject service worker failed", err);
      }
      return { cacheKeys, swUnregistered };
    },
    args: [Boolean(cacheStorage), Boolean(serviceWorkers)]
  });

  return results?.[0]?.result || { cacheKeys: 0, swUnregistered: 0 };
}

/**
 * @param {string} reason
 * @param {{ forceHardReload?: boolean, tabId?: number, url?: string }} [opts]
 */
async function clearCacheNow(reason, opts = {}) {
  if (clearInFlight) return clearInFlight;

  clearInFlight = (async () => {
    lastError = "";
    try {
      const tab =
        opts.tabId != null
          ? { id: opts.tabId, url: opts.url }
          : await getActiveTab();
      const tabUrl = opts.url || tab?.url || "";
      const target = parseHttpUrl(tabUrl);

      // Navigation / current-tab interval: skip when the relevant URL is out of scope.
      // Allowlist interval still runs against listed hosts even if the active tab differs.
      if (reason === "navigate") {
        if (!shouldClearForUrl(settings.scope, tabUrl, settings.allowlist)) {
          return { ok: true, skipped: true, lastClearAt, lastError };
        }
      } else if (reason === "interval" && settings.scope === "currentTab") {
        if (!shouldClearForUrl("currentTab", tabUrl, settings.allowlist)) {
          return { ok: true, skipped: true, lastClearAt, lastError };
        }
      }

      const scoped = settings.scope !== "all";
      const plan = planClear(settings, { isFirefox: true, scoped });
      if (!planHasWork(plan)) {
        lastError = "No clear types enabled";
        await persistState();
        return { ok: false, lastClearAt, lastError };
      }

      // Split HTTP cache (always global on Firefox) from host-scoped storage types.
      const storageTypes = { ...plan.browsingData };
      const httpCacheOnly = {};
      if (storageTypes.cache) {
        httpCacheOnly.cache = true;
        delete storageTypes.cache;
      }

      const filter = buildRemovalFilter(
        settings.scope,
        target,
        settings.allowlist,
        true
      );

      if (scoped && !filter && Object.keys(storageTypes).length > 0) {
        lastError =
          settings.scope === "allowlist"
            ? "Allowlist is empty — add domains in the popup"
            : "No valid http(s) tab to scope";
        await persistState();
        return { ok: false, lastClearAt, lastError };
      }

      // 1) Host-scoped storage / SW via browsingData (when any remain)
      if (Object.keys(storageTypes).length > 0) {
        const removalOptions = scoped && filter ? filter : { since: 0 };
        await api().browsingData.remove(removalOptions, storageTypes);
      }

      // 2) HTTP cache — Firefox always clears globally when enabled
      if (httpCacheOnly.cache) {
        if (settings.scope === "allowlist" && (!settings.allowlist || settings.allowlist.length === 0)) {
          lastError = "Allowlist is empty — add domains in the popup";
          await persistState();
          return { ok: false, lastClearAt, lastError };
        }
        await api().browsingData.remove({ since: 0 }, httpCacheOnly);
      }

      // 3) Page injection for Cache Storage / SW unregister on the relevant tab
      if ((plan.injectCacheStorage || plan.injectServiceWorkers) && tab?.id != null && target) {
        const inScope =
          settings.scope === "all" ||
          shouldClearForUrl(settings.scope, tabUrl, settings.allowlist);
        if (inScope) {
          await injectPageClear(tab.id, {
            cacheStorage: plan.injectCacheStorage,
            serviceWorkers: plan.injectServiceWorkers
          });
        }
      }

      lastClearAt = Date.now();
      lastClearReason = reason || "manual";
      lastError = "";
      await persistState();

      const wantReload =
        opts.forceHardReload === true ||
        (opts.forceHardReload !== false &&
          ((reason === "manual" && settings.hardReloadOnManual) ||
            (reason !== "manual" && settings.hardReloadOnAuto)));

      if (wantReload && tab?.id != null && target) {
        try {
          await api().tabs.reload(tab.id, { bypassCache: true });
        } catch (reloadErr) {
          console.warn("RCC hard reload failed", reloadErr);
        }
      }

      return { ok: true, lastClearAt, lastClearReason, lastError };
    } catch (err) {
      lastError = err && err.message ? String(err.message) : String(err);
      console.error("Responsive Cache Cleaner: clear failed", err);
      await persistState();
      return { ok: false, lastClearAt, lastError };
    } finally {
      clearInFlight = null;
    }
  })();

  return clearInFlight;
}

function getPublicState() {
  return {
    settings,
    lastClearAt,
    lastClearReason,
    lastError,
    defaults: DEFAULT_SETTINGS
  };
}

api().alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME || !settings.enabled) return;
  // Interval clears use the active tab for scope checks / injection.
  clearCacheNow("interval", { forceHardReload: settings.hardReloadOnAuto });
});

api().webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  if (!settings.enabled || !settings.clearOnNavigate) return;
  clearCacheNow("navigate", {
    tabId: details.tabId,
    url: details.url,
    forceHardReload: false
  });
});

api().commands?.onCommand?.addListener(async (command) => {
  if (command === "clear-now") {
    await clearCacheNow("manual", { forceHardReload: false });
  } else if (command === "clear-and-reload") {
    await clearCacheNow("manual", { forceHardReload: true });
  }
});

const MENU_CLEAR = "rcc-clear-now";
const MENU_CLEAR_RELOAD = "rcc-clear-reload";

async function ensureContextMenus() {
  const menus = api().contextMenus;
  if (!menus?.create) return;
  try {
    await menus.removeAll();
  } catch {
    // First install may have nothing to remove.
  }
  await menus.create({
    id: MENU_CLEAR,
    title: "Clear cache now",
    contexts: ["action"]
  });
  await menus.create({
    id: MENU_CLEAR_RELOAD,
    title: "Clear cache + hard reload",
    contexts: ["action"]
  });
}

api().contextMenus?.onClicked?.addListener((info) => {
  if (info.menuItemId === MENU_CLEAR) {
    clearCacheNow("manual", { forceHardReload: false });
  } else if (info.menuItemId === MENU_CLEAR_RELOAD) {
    clearCacheNow("manual", { forceHardReload: true });
  }
});

api().runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (!message || typeof message !== "object") {
      sendResponse({ ok: false, error: "Invalid message" });
      return;
    }

    if (message.type === "GET_STATE") {
      sendResponse(getPublicState());
      return;
    }

    if (message.type === "UPDATE_SETTINGS") {
      settings = applySettingsPatch(settings, message.settings || {});
      await api().storage.local.set(settings);
      await applyAlarm();
      await updateBadge();
      sendResponse(getPublicState());
      return;
    }

    if (message.type === "CLEAR_NOW") {
      const forceHardReload =
        typeof message.hardReload === "boolean" ? message.hardReload : undefined;
      const result = await clearCacheNow("manual", { forceHardReload });
      sendResponse({ ...getPublicState(), ...result });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  })();
  return true;
});

(async () => {
  await loadSettings();
  await applyAlarm();
  await updateBadge();
  await ensureContextMenus();
})();
