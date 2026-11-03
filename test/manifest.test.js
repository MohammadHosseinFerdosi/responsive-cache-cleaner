import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { toChromeManifest } from "../scripts/pack-chrome.mjs";

const rootManifest = JSON.parse(
  readFileSync(new URL("../manifest.json", import.meta.url), "utf8")
);

describe("manifest (Firefox root)", () => {
  it("uses a background event page and no Chrome-only keys", () => {
    assert.deepEqual(rootManifest.background.scripts, ["background.js"]);
    assert.equal(rootManifest.background.service_worker, undefined);
    assert.equal(rootManifest.minimum_chrome_version, undefined);
    assert.ok(rootManifest.browser_specific_settings.gecko.id);
  });

  it("keeps package.json and manifest.json versions in sync", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(pkg.version, rootManifest.version);
  });
});

describe("toChromeManifest", () => {
  it("derives a service-worker manifest without gecko settings", () => {
    const chrome = toChromeManifest(rootManifest);
    assert.deepEqual(chrome.background, { service_worker: "background.js", type: "module" });
    assert.equal(chrome.browser_specific_settings, undefined);
    assert.equal(chrome.minimum_chrome_version, "109");
    assert.equal(chrome.version, rootManifest.version);
    assert.deepEqual(chrome.permissions, rootManifest.permissions);
  });

  it("does not mutate the source manifest", () => {
    const before = JSON.stringify(rootManifest);
    toChromeManifest(rootManifest);
    assert.equal(JSON.stringify(rootManifest), before);
  });

  it("rejects manifests without a single background script", () => {
    assert.throws(() => toChromeManifest({ background: { scripts: ["a.js", "b.js"] } }));
    assert.throws(() => toChromeManifest({}));
  });
});
