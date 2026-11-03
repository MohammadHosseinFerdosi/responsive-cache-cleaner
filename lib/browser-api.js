/**
 * Tiny chrome.* / browser.* compatibility helpers (no external polyfill).
 * Chrome MV3 returns Promises from most APIs when the callback is omitted.
 */

/** @returns {typeof chrome} */
export function ext() {
  return /** @type {typeof chrome} */ (
    typeof globalThis.browser !== "undefined" ? globalThis.browser : globalThis.chrome
  );
}

/** True when running under Firefox (Gecko). */
export function isFirefox() {
  try {
    const rt = ext().runtime;
    if (typeof rt?.getBrowserInfo === "function") return true;
    const url = typeof rt?.getURL === "function" ? rt.getURL("") : "";
    return typeof url === "string" && url.startsWith("moz-extension:");
  } catch {
    return false;
  }
}

/** True when the extension API namespace looks like Chromium. */
export function isChromium() {
  return !isFirefox() && typeof globalThis.chrome !== "undefined";
}
