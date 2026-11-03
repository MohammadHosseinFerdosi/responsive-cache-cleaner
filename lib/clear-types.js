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
 * @returns {{ browsingData: Record<string, boolean>, injectCacheStorage: boolean, injectServiceWorkers: boolean }}
 */
export function planClear(flags, opts = {}) {
  const isFirefox = Boolean(opts.isFirefox);
  const scoped = Boolean(opts.scoped);

  /** @type {Record<string, boolean>} */
  const browsingData = {};

  // Firefox: removeCache always clears the entire HTTP cache; still useful for QA.
  // When scoped, we still request cache:true globally after/with storage clears.
  if (flags.clearHttpCache) {
    browsingData.cache = true;
  }

  if (flags.clearCookies) browsingData.cookies = true;
  if (flags.clearLocalStorage) browsingData.localStorage = true;
  if (flags.clearIndexedDB) browsingData.indexedDB = true;

  // Chrome supports these via browsingData; Firefox does not accept the keys.
  let injectCacheStorage = Boolean(flags.clearCacheStorage);
  let injectServiceWorkers = Boolean(flags.clearServiceWorkers);

  if (!isFirefox) {
    if (flags.clearCacheStorage) browsingData.cacheStorage = true;
    if (flags.clearServiceWorkers) browsingData.serviceWorkers = true;
    // Prefer API over injection when available
    injectCacheStorage = false;
    injectServiceWorkers = false;
  } else {
    // Firefox can clear SW registrations via browsingData with hostnames,
    // but Cache API (Cache Storage) needs page injection.
    if (flags.clearServiceWorkers) {
      browsingData.serviceWorkers = true;
      // Also inject unregister for the active tab as a belt-and-suspenders step
      injectServiceWorkers = true;
    }
  }

  // If scoped on Firefox and only HTTP cache is selected, browsingData host filter
  // is useless for cache — still return { cache: true } for a global HTTP wipe.
  if (scoped && isFirefox && Object.keys(browsingData).length === 1 && browsingData.cache) {
    // intentional no-op branch kept for clarity / tests
  }

  return { browsingData, injectCacheStorage, injectServiceWorkers };
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
