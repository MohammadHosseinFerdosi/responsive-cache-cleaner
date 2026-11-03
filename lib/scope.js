/**
 * Hostname / URL scope helpers for site-limited clearing.
 */

/**
 * @param {string|undefined|null} urlString
 * @returns {{ hostname: string, origin: string } | null}
 */
export function parseHttpUrl(urlString) {
  if (!urlString || typeof urlString !== "string") return null;
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return { hostname: url.hostname.toLowerCase(), origin: url.origin };
}

/**
 * Exact hostname or parent-domain match (allowlist entry "example.com" matches "a.example.com").
 * @param {string} hostname
 * @param {string[]} allowlist
 */
export function hostnameMatchesAllowlist(hostname, allowlist) {
  if (!hostname || !Array.isArray(allowlist) || allowlist.length === 0) return false;
  const host = hostname.toLowerCase();
  for (const entry of allowlist) {
    const e = String(entry).toLowerCase().replace(/^\.+/, "");
    if (!e) continue;
    // Exact or strict subdomain (avoid "notexample.com" matching "example.com").
    if (host === e || host.endsWith("." + e)) return true;
  }
  return false;
}

/**
 * Decide whether automatic clearing should run for a navigation / tab URL.
 * @param {"all"|"currentTab"|"allowlist"} scope
 * @param {string|null|undefined} urlString
 * @param {string[]} allowlist
 */
export function shouldClearForUrl(scope, urlString, allowlist = []) {
  if (scope === "all") {
    const parsed = parseHttpUrl(urlString);
    // For "all", still skip non-http(s) navigations (about:, moz-extension:, etc.)
    return parsed !== null || !urlString;
  }

  const parsed = parseHttpUrl(urlString);
  if (!parsed) return false;

  if (scope === "currentTab") return true;
  if (scope === "allowlist") return hostnameMatchesAllowlist(parsed.hostname, allowlist);
  return false;
}

/**
 * Whether a tab URL should receive Cache Storage / SW page injection for this clear.
 * For scope "all", Cache Storage is still per-origin — inject tabs sharing the active hostname.
 *
 * @param {"all"|"currentTab"|"allowlist"} scope
 * @param {string|null|undefined} tabUrl
 * @param {{ hostname: string, origin: string } | null} activeTarget
 * @param {string[]} allowlist
 */
export function shouldInjectForTab(scope, tabUrl, activeTarget, allowlist = []) {
  const parsed = parseHttpUrl(tabUrl);
  if (!parsed) return false;

  if (scope === "allowlist") {
    return hostnameMatchesAllowlist(parsed.hostname, allowlist);
  }

  if (scope === "currentTab") {
    if (!activeTarget) return false;
    return parsed.hostname === activeTarget.hostname;
  }

  // scope === "all": prefer same-host as the active http(s) tab; if none, skip.
  if (!activeTarget) return false;
  return parsed.hostname === activeTarget.hostname;
}

/**
 * Origins to pass to Chromium browsingData (exact origin match, unlike Firefox hostnames).
 * Includes http(s) for listed hosts plus any open-tab origins that match the allowlist /
 * current-tab hostname so ports and subdomains are covered when tabs are open.
 *
 * @param {"all"|"currentTab"|"allowlist"} scope
 * @param {{ hostname: string, origin: string } | null} target
 * @param {string[]} allowlist
 * @param {string[]} [tabUrls] open tab URLs (optional enrichment)
 * @returns {string[] | null} null = no origin filter (entire browser)
 */
export function collectChromeOrigins(scope, target, allowlist = [], tabUrls = []) {
  if (scope === "all") return null;

  /** @type {Set<string>} */
  const origins = new Set();

  if (scope === "currentTab") {
    if (!target) return [];
    origins.add(target.origin);
    for (const url of tabUrls) {
      const parsed = parseHttpUrl(url);
      if (parsed && parsed.hostname === target.hostname) origins.add(parsed.origin);
    }
    return [...origins];
  }

  if (scope === "allowlist") {
    const hosts = normalizeHosts(allowlist);
    if (hosts.length === 0) return [];
    for (const h of hosts) {
      origins.add(`https://${h}`);
      origins.add(`http://${h}`);
    }
    for (const url of tabUrls) {
      const parsed = parseHttpUrl(url);
      if (parsed && hostnameMatchesAllowlist(parsed.hostname, hosts)) {
        origins.add(parsed.origin);
      }
    }
    return [...origins];
  }

  return null;
}

/**
 * Build browsingData removal filter for storage-like types.
 * HTTP cache ignores host/origin filters on both Firefox and Chromium — callers should
 * clear `cache` in a separate remove({ since: 0 }) call.
 *
 * Firefox uses `hostnames`; Chromium uses `origins` (exact). Pass open tab URLs via
 * `tabUrls` so Chromium allowlist/currentTab can include ports and live subdomains.
 *
 * @param {"all"|"currentTab"|"allowlist"} scope
 * @param {{ hostname: string, origin: string } | null} target
 * @param {string[]} allowlist
 * @param {boolean} isFirefox
 * @param {string[]} [tabUrls]
 */
export function buildRemovalFilter(
  scope,
  target,
  allowlist = [],
  isFirefox = true,
  tabUrls = []
) {
  if (scope === "all") {
    return { since: 0 };
  }

  if (scope === "currentTab") {
    if (!target) return null;
    if (isFirefox) {
      return { since: 0, hostnames: [target.hostname] };
    }
    const origins = collectChromeOrigins(scope, target, allowlist, tabUrls);
    if (!origins || origins.length === 0) return null;
    return { since: 0, origins };
  }

  if (scope === "allowlist") {
    const hosts = normalizeHosts(allowlist);
    if (hosts.length === 0) return null;
    if (isFirefox) {
      return { since: 0, hostnames: hosts };
    }
    const origins = collectChromeOrigins(scope, target, allowlist, tabUrls);
    if (!origins || origins.length === 0) return null;
    return { since: 0, origins };
  }

  return { since: 0 };
}

function normalizeHosts(list) {
  if (!Array.isArray(list)) return [];
  return [
    ...new Set(
      list
        .map((h) => String(h).trim().toLowerCase())
        .filter(Boolean)
    )
  ];
}
