import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planClear, planHasWork } from "../lib/clear-types.js";

const base = {
  clearHttpCache: true,
  clearCacheStorage: true,
  clearServiceWorkers: false,
  clearLocalStorage: false,
  clearIndexedDB: false,
  clearCookies: false
};

describe("planClear", () => {
  it("uses injection for Cache Storage on Firefox", () => {
    const plan = planClear(base, { isFirefox: true });
    assert.equal(plan.browsingData.cache, true);
    assert.equal(plan.browsingData.cacheStorage, undefined);
    assert.equal(plan.injectCacheStorage, true);
    assert.equal(plan.injectServiceWorkers, false);
  });

  it("uses browsingData cacheStorage on Chromium", () => {
    const plan = planClear(base, { isFirefox: false });
    assert.equal(plan.browsingData.cacheStorage, true);
    assert.equal(plan.injectCacheStorage, false);
  });

  it("enables SW browsingData + inject on Firefox when requested", () => {
    const plan = planClear({ ...base, clearServiceWorkers: true }, { isFirefox: true });
    assert.equal(plan.browsingData.serviceWorkers, true);
    assert.equal(plan.injectServiceWorkers, true);
  });

  it("reports empty plans", () => {
    const plan = planClear(
      {
        clearHttpCache: false,
        clearCacheStorage: false,
        clearServiceWorkers: false,
        clearLocalStorage: false,
        clearIndexedDB: false,
        clearCookies: false
      },
      { isFirefox: true }
    );
    assert.equal(planHasWork(plan), false);
  });
});
