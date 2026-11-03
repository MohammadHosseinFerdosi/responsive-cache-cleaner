import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SETTINGS,
  PRESETS,
  addHostToAllowlist,
  applyPreset,
  applySettingsPatch,
  clampIntervalSeconds,
  mergeSettings,
  normalizeAllowlist
} from "../lib/settings.js";

describe("normalizeAllowlist", () => {
  it("trims, lowercases, and dedupes", () => {
    assert.deepEqual(normalizeAllowlist([" Example.COM ", "example.com", "app.local"]), [
      "example.com",
      "app.local"
    ]);
  });

  it("drops invalid entries", () => {
    assert.deepEqual(normalizeAllowlist(["https://x.com", "a/b", "ok.com", ""]), ["ok.com"]);
  });
});

describe("addHostToAllowlist", () => {
  it("adds a valid host once", () => {
    assert.deepEqual(addHostToAllowlist(["localhost"], "App.Example.com"), [
      "localhost",
      "app.example.com"
    ]);
    assert.deepEqual(addHostToAllowlist(["localhost"], "localhost"), ["localhost"]);
  });

  it("rejects invalid hosts", () => {
    assert.deepEqual(addHostToAllowlist(["a.test"], "https://x"), ["a.test"]);
  });
});

describe("clampIntervalSeconds", () => {
  it("clamps to 1..600", () => {
    assert.equal(clampIntervalSeconds(0), 1);
    assert.equal(clampIntervalSeconds(999), 600);
    assert.equal(clampIntervalSeconds("12"), 12);
    assert.equal(clampIntervalSeconds("nope"), DEFAULT_SETTINGS.intervalSeconds);
  });
});

describe("mergeSettings", () => {
  it("applies defaults for empty storage", () => {
    const s = mergeSettings({});
    assert.equal(s.enabled, true);
    assert.equal(s.clearHttpCache, true);
    assert.equal(s.clearCacheStorage, true);
    assert.equal(s.clearCookies, false);
    assert.equal(s.scope, "all");
    assert.equal(s.hardReloadMatchingTabs, false);
    assert.equal(s.badgeFlashOnClear, true);
  });

  it("validates scope and preserves opt-ins", () => {
    const s = mergeSettings({
      scope: "nope",
      clearServiceWorkers: 1,
      allowlist: ["Dev.Local"],
      hardReloadMatchingTabs: 1
    });
    assert.equal(s.scope, "all");
    assert.equal(s.clearServiceWorkers, true);
    assert.deepEqual(s.allowlist, ["dev.local"]);
    assert.equal(s.hardReloadMatchingTabs, true);
  });
});

describe("applySettingsPatch", () => {
  it("merges partial updates", () => {
    const current = mergeSettings({});
    const next = applySettingsPatch(current, { enabled: false, scope: "allowlist" });
    assert.equal(next.enabled, false);
    assert.equal(next.scope, "allowlist");
    assert.equal(next.intervalSeconds, current.intervalSeconds);
  });
});

describe("applyPreset", () => {
  it("applies QA and SW-bust clear flags", () => {
    const dirty = mergeSettings({
      clearCookies: true,
      clearServiceWorkers: true,
      clearLocalStorage: true
    });
    const qa = applyPreset(dirty, "qa");
    assert.equal(qa.clearHttpCache, PRESETS.qa.clearHttpCache);
    assert.equal(qa.clearCacheStorage, PRESETS.qa.clearCacheStorage);
    assert.equal(qa.clearServiceWorkers, PRESETS.qa.clearServiceWorkers);
    assert.equal(qa.clearLocalStorage, PRESETS.qa.clearLocalStorage);
    assert.equal(qa.clearIndexedDB, PRESETS.qa.clearIndexedDB);
    assert.equal(qa.clearCookies, PRESETS.qa.clearCookies);
    const sw = applyPreset(qa, "swBust");
    assert.equal(sw.clearServiceWorkers, true);
    assert.equal(sw.clearCookies, false);
  });
});
