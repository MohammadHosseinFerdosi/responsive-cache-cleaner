"use strict";

import {
  DEFAULT_SETTINGS,
  addHostToAllowlist,
  applyPreset,
  applySettingsPatch,
  mergeSettings
} from "./lib/settings.js";
import {
  buildRemovalFilter,
  parseHttpUrl,
  shouldClearForUrl,
  shouldInjectForTab
} from "./lib/scope.js";
import { formatClearSummary, planClear, planHasWork } from "./lib/clear-types.js";

const ALARM_NAME = "periodic-clear";
const BADGE_RESTORE_ALARM = "badge-restore";

/** @type {ReturnType<typeof mergeSettings>} */
let settings = mergeSettings(DEFAULT_SETTINGS);
let lastClearAt = 0;
let lastClearReason = "";
let lastError = "";
/** @type {Record<string, unknown>} */
let lastClearDetail = {};
let clearInFlight = null;

function api() {
  return typeof browser !== "undefined" ? browser : chrome;
}

async function persistState(extra = {}) {
  await api().storage.local.set({
    lastClearAt,
    lastClearReason,
    lastError,
    lastClearDetail,
    ...extra
  });
}

async function loadSettings() {
  const stored = await api().storage.local.get([
    ...Object.keys(DEFAULT_SETTINGS),
    "lastClearAt",
    "lastClearReason",
    "lastError",
    "lastClearDetail"
  ]);
  settings = mergeSettings(stored);
  lastClearAt = Number(stored.lastClearAt) || 0;
  lastClearReason = stored.lastClearReason || "";
  lastError = stored.lastError || "";
  lastClearDetail =
    stored.lastClearDetail && typeof stored.lastClearDetail === "object"
      ? stored.lastClearDetail
      : {};
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

async function flashBadge(ok) {
  if (!settings.badgeFlashOnClear) {
    await updateBadge();
    return;
  }
  const action = api().action || api().browserAction;
  if (!action?.setBadgeText) return;
  try {
    await action.setBadgeText({ text: ok ? "OK" : "!" });
    await action.setBadgeBackgroundColor({
      color: ok ? "#0b6e4f" : "#b42318"
    });
    await api().alarms.clear(BADGE_RESTORE_ALARM);
    // ~1.8s — alarms use minutes
    api().alarms.create(BADGE_RESTORE_ALARM, { delayInMinutes: 0.03 });
  } catch {
    await updateBadge();
  }
}

async function getActiveTab() {
  const tabs = await api().tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

/**
 * Open http(s) tabs that should receive Cache Storage / SW injection.
 * @param {{ hostname: string, origin: string } | null} activeTarget
 */
async function collectInjectionTabs(activeTarget) {
  const tabs = await api().tabs.query({});
  /** @type {{ id: number, url?: string }[]} */
  const matched = [];
  for (const tab of tabs) {
    if (tab.id == null) continue;
    if (
      shouldInjectForTab(settings.scope, tab.url, activeTarget, settings.allowlist)
    ) {
      matched.push(tab);
    }
  }
  return matched;
}

async function injectPageClear(tabId, { cacheStorage, serviceWorkers }) {
  if (!tabId || (!cacheStorage && !serviceWorkers)) {
    return { cacheKeys: 0, swUnregistered: 0, ok: false };
  }

  try {
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

    return {
      ...(results?.[0]?.result || { cacheKeys: 0, swUnregistered: 0 }),
      ok: true
    };
  } catch (err) {
    console.warn("RCC inject failed for tab", tabId, err);
    return { cacheKeys: 0, swUnregistered: 0, ok: false };
  }
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
          return { ok: true, skipped: true, lastClearAt, lastError, lastClearDetail };
        }
      } else if (reason === "interval" && settings.scope === "currentTab") {
        if (!shouldClearForUrl("currentTab", tabUrl, settings.allowlist)) {
          return { ok: true, skipped: true, lastClearAt, lastError, lastClearDetail };
        }
      }

      const scoped = settings.scope !== "all";
      const plan = planClear(settings, { isFirefox: true, scoped });
      if (!planHasWork(plan)) {
        lastError = "No clear types enabled";
        await persistState();
        await flashBadge(false);
        return { ok: false, lastClearAt, lastError, lastClearDetail };
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
        await flashBadge(false);
        return { ok: false, lastClearAt, lastError, lastClearDetail };
      }

      // 1) Host-scoped storage / SW via browsingData (when any remain)
      if (Object.keys(storageTypes).length > 0) {
        const removalOptions = scoped && filter ? filter : { since: 0 };
        await api().browsingData.remove(removalOptions, storageTypes);
      }

      // 2) HTTP cache — Firefox always clears globally when enabled
      if (httpCacheOnly.cache) {
        if (
          settings.scope === "allowlist" &&
          (!settings.allowlist || settings.allowlist.length === 0)
        ) {
          lastError = "Allowlist is empty — add domains in the popup";
          await persistState();
          await flashBadge(false);
          return { ok: false, lastClearAt, lastError, lastClearDetail };
        }
        await api().browsingData.remove({ since: 0 }, httpCacheOnly);
      }

      // 3) Page injection for Cache Storage / SW on all matching open tabs
      let tabsInjected = 0;
      let cacheKeys = 0;
      let swUnregistered = 0;
      /** @type {number[]} */
      const injectedTabIds = [];

      if (plan.injectCacheStorage || plan.injectServiceWorkers) {
        const injectTabs = await collectInjectionTabs(target);
        for (const t of injectTabs) {
          const result = await injectPageClear(t.id, {
            cacheStorage: plan.injectCacheStorage,
            serviceWorkers: plan.injectServiceWorkers
          });
          if (result.ok) {
            tabsInjected += 1;
            injectedTabIds.push(t.id);
            cacheKeys += Number(result.cacheKeys) || 0;
            swUnregistered += Number(result.swUnregistered) || 0;
          }
        }
      }

      lastClearAt = Date.now();
      lastClearReason = reason || "manual";
      lastError = "";
      lastClearDetail = {
        labels: plan.labels,
        tabsInjected,
        cacheKeys,
        swUnregistered,
        reason: lastClearReason,
        summary: formatClearSummary({
          labels: plan.labels,
          tabsInjected,
          cacheKeys,
          swUnregistered
        })
      };
      await persistState();
      await flashBadge(true);

      const wantReload =
        opts.forceHardReload === true ||
        (opts.forceHardReload !== false &&
          ((reason === "manual" && settings.hardReloadOnManual) ||
            (reason !== "manual" && settings.hardReloadOnAuto)));

      if (wantReload) {
        const reloadIds = new Set();
        if (tab?.id != null && target) reloadIds.add(tab.id);
        if (settings.hardReloadMatchingTabs) {
          for (const id of injectedTabIds) reloadIds.add(id);
        }
        for (const id of reloadIds) {
          try {
            // bypassCache after inject completes — more reliable for SW-controlled pages
            await api().tabs.reload(id, { bypassCache: true });
          } catch (reloadErr) {
            console.warn("RCC hard reload failed", id, reloadErr);
          }
        }
      }

      return {
        ok: true,
        lastClearAt,
        lastClearReason,
        lastError,
        lastClearDetail
      };
    } catch (err) {
      lastError = err && err.message ? String(err.message) : String(err);
      console.error("Responsive Cache Cleaner: clear failed", err);
      await persistState();
      await flashBadge(false);
      return { ok: false, lastClearAt, lastError, lastClearDetail };
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
    lastClearDetail,
    defaults: DEFAULT_SETTINGS
  };
}

api().alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BADGE_RESTORE_ALARM) {
    updateBadge();
    return;
  }
  if (alarm.name !== ALARM_NAME || !settings.enabled) return;
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
const MENU_ADD_ALLOWLIST = "rcc-add-allowlist";

async function ensureContextMenus() {
  const menus = api().contextMenus;
  if (!menus?.create) return;
  try {
    await menus.removeAll();
  } catch {
    // First install may have nothing to remove.
  }
  const pageTabAction = ["action", "page", "tab"];
  await menus.create({
    id: MENU_CLEAR,
    title: "Clear cache now",
    contexts: pageTabAction
  });
  await menus.create({
    id: MENU_CLEAR_RELOAD,
    title: "Clear cache + hard reload",
    contexts: pageTabAction
  });
  await menus.create({
    id: MENU_ADD_ALLOWLIST,
    title: "Add site to allowlist",
    contexts: ["page", "tab"]
  });
}

api().contextMenus?.onClicked?.addListener(async (info, tab) => {
  const url = info.pageUrl || tab?.url || "";
  if (info.menuItemId === MENU_CLEAR) {
    clearCacheNow("manual", {
      forceHardReload: false,
      tabId: tab?.id,
      url
    });
    return;
  }
  if (info.menuItemId === MENU_CLEAR_RELOAD) {
    clearCacheNow("manual", {
      forceHardReload: true,
      tabId: tab?.id,
      url
    });
    return;
  }
  if (info.menuItemId === MENU_ADD_ALLOWLIST) {
    const parsed = parseHttpUrl(url);
    if (!parsed) return;
    settings = applySettingsPatch(settings, {
      scope: "allowlist",
      allowlist: addHostToAllowlist(settings.allowlist, parsed.hostname)
    });
    await api().storage.local.set(settings);
    await updateBadge();
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

    if (message.type === "APPLY_PRESET") {
      settings = applyPreset(settings, message.preset);
      await api().storage.local.set(settings);
      await applyAlarm();
      await updateBadge();
      sendResponse(getPublicState());
      return;
    }

    if (message.type === "ADD_CURRENT_TO_ALLOWLIST") {
      const active = await getActiveTab();
      const parsed = parseHttpUrl(active?.url || "");
      if (!parsed) {
        sendResponse({
          ...getPublicState(),
          ok: false,
          lastError: "No http(s) tab to add"
        });
        return;
      }
      settings = applySettingsPatch(settings, {
        scope: "allowlist",
        allowlist: addHostToAllowlist(settings.allowlist, parsed.hostname)
      });
      await api().storage.local.set(settings);
      sendResponse({ ...getPublicState(), ok: true, addedHost: parsed.hostname });
      return;
    }

    if (message.type === "CLEAR_NOW") {
      const forceHardReload =
        typeof message.hardReload === "boolean" ? message.hardReload : undefined;
      const result = await clearCacheNow("manual", { forceHardReload });
      sendResponse({ ...getPublicState(), ...result });
      return;
    }

    if (message.type === "OPEN_OPTIONS") {
      if (api().runtime.openOptionsPage) {
        await api().runtime.openOptionsPage();
      }
      sendResponse({ ok: true });
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
