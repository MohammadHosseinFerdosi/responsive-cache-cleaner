/**
 * Build browsingData data-type maps and page-injection flags.
 * Firefox rejects unknown keys (cacheStorage) — strip them when needed.
 */

/**
 * @typedef {object} ClearFlags
 * @property {boolean} clearHttpCache
 * @property {boolean} clearCacheStorage
 * @property {boolean} clearServiceWorkers
 * @property {boolean} clearLocalStorage
 * @property {boolean} clearIndexedDB
 * @property {boolean} clearCookies
 */

/**
 * Types passed to browser.browsingData.remove.
 * On Firefox, HTTP cache cannot be limited by hostname; host filters still apply
 * to cookies / storage / serviceWorkers.
 *
 * @param {ClearFlags} flags
 * @param {{ isFirefox?: boolean, scoped?: boolean }} [opts]
 * @returns {{ browsingData: Record<string, boolean>, injectCacheStorage: boolean, injectServiceWorkers: boolean, labels: string[] }}
 */
export function planClear(flags, opts = {}) {
  const isFirefox = Boolean(opts.isFirefox);
  const scoped = Boolean(opts.scoped);

  /** @type {Record<string, boolean>} */
  const browsingData = {};
  /** @type {string[]} */
  const labels = [];

  // Firefox: removeCache always clears the entire HTTP cache; still useful for QA.
  if (flags.clearHttpCache) {
    browsingData.cache = true;
    labels.push("HTTP cache");
  }

  if (flags.clearCookies) {
    browsingData.cookies = true;
    labels.push("cookies");
  }
  if (flags.clearLocalStorage) {
    browsingData.localStorage = true;
    labels.push("localStorage");
  }
  if (flags.clearIndexedDB) {
    browsingData.indexedDB = true;
    labels.push("IndexedDB");
  }

  // Chrome supports these via browsingData; Firefox does not accept cacheStorage.
  let injectCacheStorage = Boolean(flags.clearCacheStorage);
  let injectServiceWorkers = Boolean(flags.clearServiceWorkers);

  if (!isFirefox) {
    if (flags.clearCacheStorage) browsingData.cacheStorage = true;
    if (flags.clearServiceWorkers) browsingData.serviceWorkers = true;
    injectCacheStorage = false;
    injectServiceWorkers = false;
  } else {
    // Firefox: Cache API needs page injection. SW registrations can use browsingData
    // (hostnames supported); also inject unregister on matched tabs.
    if (flags.clearServiceWorkers) {
      browsingData.serviceWorkers = true;
      injectServiceWorkers = true;
    }
  }

  if (flags.clearCacheStorage) labels.push("Cache Storage");
  if (flags.clearServiceWorkers) labels.push("service workers");

  // `scoped` is retained for callers/tests; HTTP cache is always global on both engines.
  void scoped;

  return { browsingData, injectCacheStorage, injectServiceWorkers, labels };
}

/**
 * Whether a plan will actually do anything.
 * @param {ReturnType<typeof planClear>} plan
 */
export function planHasWork(plan) {
  return (
    Object.keys(plan.browsingData).length > 0 ||
    plan.injectCacheStorage ||
    plan.injectServiceWorkers
  );
}

/**
 * Human-readable summary line for popup / badge status.
 * @param {{ labels?: string[], tabsInjected?: number, cacheKeys?: number, swUnregistered?: number, reason?: string }} detail
 */
export function formatClearSummary(detail = {}) {
  const parts = [];
  if (detail.labels?.length) parts.push(detail.labels.join(", "));
  if (detail.tabsInjected > 0) {
    parts.push(
      `${detail.tabsInjected} tab${detail.tabsInjected === 1 ? "" : "s"} injected`
    );
  }
  if (detail.cacheKeys > 0) parts.push(`${detail.cacheKeys} cache key(s)`);
  if (detail.swUnregistered > 0) {
    parts.push(`${detail.swUnregistered} SW unregistered`);
  }
  return parts.join(" · ") || "cleared";
}
