import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatClearSummary, planClear, planHasWork } from "../lib/clear-types.js";

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
    assert.ok(plan.labels.includes("HTTP cache"));
    assert.ok(plan.labels.includes("Cache Storage"));
  });

  it("uses browsingData cacheStorage on Chromium", () => {
    const plan = planClear(base, { isFirefox: false });
    assert.equal(plan.browsingData.cacheStorage, true);
    assert.equal(plan.injectCacheStorage, false);
  });

  it("uses browsingData serviceWorkers on Chromium without inject", () => {
    const plan = planClear({ ...base, clearServiceWorkers: true }, { isFirefox: false });
    assert.equal(plan.browsingData.serviceWorkers, true);
    assert.equal(plan.injectServiceWorkers, false);
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

  it("maps optional storage types on both engines", () => {
    const flags = {
      ...base,
      clearLocalStorage: true,
      clearIndexedDB: true,
      clearCookies: true
    };
    const ff = planClear(flags, { isFirefox: true, scoped: true });
    const cr = planClear(flags, { isFirefox: false, scoped: true });
    assert.equal(ff.browsingData.localStorage, true);
    assert.equal(ff.browsingData.indexedDB, true);
    assert.equal(ff.browsingData.cookies, true);
    assert.equal(cr.browsingData.localStorage, true);
    assert.equal(cr.browsingData.indexedDB, true);
    assert.equal(cr.browsingData.cookies, true);
    assert.ok(planHasWork(ff));
    assert.ok(planHasWork(cr));
  });

  it("treats cache-storage-only Firefox plan as inject work", () => {
    const plan = planClear(
      {
        clearHttpCache: false,
        clearCacheStorage: true,
        clearServiceWorkers: false,
        clearLocalStorage: false,
        clearIndexedDB: false,
        clearCookies: false
      },
      { isFirefox: true }
    );
    assert.equal(Object.keys(plan.browsingData).length, 0);
    assert.equal(plan.injectCacheStorage, true);
    assert.equal(planHasWork(plan), true);
  });
});

describe("formatClearSummary", () => {
  it("joins labels and inject stats", () => {
    assert.equal(
      formatClearSummary({
        labels: ["HTTP cache", "Cache Storage"],
        tabsInjected: 2,
        cacheKeys: 3,
        swUnregistered: 1
      }),
      "HTTP cache, Cache Storage · 2 tabs injected · 3 cache key(s) · 1 SW unregistered"
    );
    assert.equal(
      formatClearSummary({ tabsInjected: 1, cacheKeys: 0, swUnregistered: 0 }),
      "1 tab injected"
    );
    assert.equal(formatClearSummary({}), "cleared");
  });
});
