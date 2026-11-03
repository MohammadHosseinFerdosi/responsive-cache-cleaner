import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { ext, isChromium, isFirefox } from "../lib/browser-api.js";

describe("browser-api", () => {
  let originalBrowser;
  let originalChrome;

  beforeEach(() => {
    originalBrowser = globalThis.browser;
    originalChrome = globalThis.chrome;
  });

  afterEach(() => {
    if (originalBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = originalBrowser;
    if (originalChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = originalChrome;
  });

  it("prefers browser.* when present (Firefox)", () => {
    globalThis.browser = {
      runtime: {
        getBrowserInfo: async () => ({ name: "Firefox" }),
        getURL: (p) => `moz-extension://id/${p}`
      }
    };
    globalThis.chrome = { runtime: { getURL: (p) => `chrome-extension://id/${p}` } };
    assert.equal(ext(), globalThis.browser);
    assert.equal(isFirefox(), true);
    assert.equal(isChromium(), false);
  });

  it("falls back to chrome.* and detects Chromium via extension URL", () => {
    delete globalThis.browser;
    globalThis.chrome = {
      runtime: {
        getURL: (p) => `chrome-extension://abcdef/${p}`
      }
    };
    assert.equal(ext(), globalThis.chrome);
    assert.equal(isFirefox(), false);
    assert.equal(isChromium(), true);
  });

  it("treats missing APIs as non-Firefox", () => {
    delete globalThis.browser;
    delete globalThis.chrome;
    assert.equal(isFirefox(), false);
    assert.equal(isChromium(), false);
  });
});
