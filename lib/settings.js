/**
 * Defaults and validation for Responsive Cache Cleaner.
 * Pure module — safe to unit-test in Node without a browser.
 */

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  intervalSeconds: 5,
  clearOnNavigate: true,
  clearHttpCache: true,
  clearCacheStorage: true,
  clearServiceWorkers: false,
  clearLocalStorage: false,
  clearIndexedDB: false,
  clearCookies: false,
  /** @type {"all"|"currentTab"|"allowlist"} */
  scope: "all",
  /** Hostnames without protocol, e.g. "localhost", "app.example.com" */
  allowlist: Object.freeze([]),
  hardReloadOnManual: true,
  hardReloadOnAuto: false
});

const ALLOWED_SCOPES = new Set(["all", "currentTab", "allowlist"]);

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeAllowlist(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const host = item.trim().toLowerCase().replace(/^\.+/, "");
    if (!host || host.includes("/") || host.includes(":") || host.includes(" ")) continue;
    if (seen.has(host)) continue;
    seen.add(host);
    out.push(host);
  }
  return out;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
export function clampIntervalSeconds(value, fallback = DEFAULT_SETTINGS.intervalSeconds) {
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(600, Math.max(1, Math.trunc(n)));
}

/**
 * Merge stored values onto defaults with validation.
 * @param {Record<string, unknown>} [stored]
 */
export function mergeSettings(stored = {}) {
  const src = stored && typeof stored === "object" ? stored : {};
  const scope = ALLOWED_SCOPES.has(src.scope) ? src.scope : DEFAULT_SETTINGS.scope;

  return {
    enabled: src.enabled === undefined ? DEFAULT_SETTINGS.enabled : Boolean(src.enabled),
    intervalSeconds: clampIntervalSeconds(src.intervalSeconds),
    clearOnNavigate:
      src.clearOnNavigate === undefined
        ? DEFAULT_SETTINGS.clearOnNavigate
        : Boolean(src.clearOnNavigate),
    clearHttpCache:
      src.clearHttpCache === undefined
        ? DEFAULT_SETTINGS.clearHttpCache
        : Boolean(src.clearHttpCache),
    clearCacheStorage:
      src.clearCacheStorage === undefined
        ? DEFAULT_SETTINGS.clearCacheStorage
        : Boolean(src.clearCacheStorage),
    clearServiceWorkers: Boolean(src.clearServiceWorkers),
    clearLocalStorage: Boolean(src.clearLocalStorage),
    clearIndexedDB: Boolean(src.clearIndexedDB),
    clearCookies: Boolean(src.clearCookies),
    scope,
    allowlist: normalizeAllowlist(src.allowlist),
    hardReloadOnManual:
      src.hardReloadOnManual === undefined
        ? DEFAULT_SETTINGS.hardReloadOnManual
        : Boolean(src.hardReloadOnManual),
    hardReloadOnAuto: Boolean(src.hardReloadOnAuto)
  };
}

/**
 * Apply a partial update onto current settings.
 * @param {ReturnType<typeof mergeSettings>} current
 * @param {Record<string, unknown>} partial
 */
export function applySettingsPatch(current, partial = {}) {
  return mergeSettings({ ...current, ...partial });
}
