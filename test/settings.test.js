import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SETTINGS,
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
  });

  it("validates scope and preserves opt-ins", () => {
    const s = mergeSettings({
      scope: "nope",
      clearServiceWorkers: 1,
      allowlist: ["Dev.Local"]
    });
    assert.equal(s.scope, "all");
    assert.equal(s.clearServiceWorkers, true);
    assert.deepEqual(s.allowlist, ["dev.local"]);
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
