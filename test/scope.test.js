import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRemovalFilter,
  collectChromeOrigins,
  hostnameMatchesAllowlist,
  parseHttpUrl,
  shouldClearForUrl,
  shouldInjectForTab
} from "../lib/scope.js";

describe("parseHttpUrl", () => {
  it("parses http(s) only", () => {
    assert.deepEqual(parseHttpUrl("https://App.Example.com:443/path"), {
      hostname: "app.example.com",
      origin: "https://app.example.com"
    });
    assert.equal(parseHttpUrl("about:blank"), null);
    assert.equal(parseHttpUrl("moz-extension://abc"), null);
  });
});

describe("hostnameMatchesAllowlist", () => {
  it("matches exact and subdomain", () => {
    assert.equal(hostnameMatchesAllowlist("app.example.com", ["example.com"]), true);
    assert.equal(hostnameMatchesAllowlist("example.com", ["example.com"]), true);
    assert.equal(hostnameMatchesAllowlist("evil.com", ["example.com"]), false);
  });
});

describe("shouldClearForUrl", () => {
  it("handles scopes", () => {
    assert.equal(shouldClearForUrl("all", "https://a.test"), true);
    assert.equal(shouldClearForUrl("all", "about:blank"), false);
    assert.equal(shouldClearForUrl("currentTab", "https://a.test"), true);
    assert.equal(shouldClearForUrl("currentTab", "about:blank"), false);
    assert.equal(shouldClearForUrl("allowlist", "https://a.test", ["a.test"]), true);
    assert.equal(shouldClearForUrl("allowlist", "https://b.test", ["a.test"]), false);
  });
});

describe("shouldInjectForTab", () => {
  const target = { hostname: "app.test", origin: "https://app.test" };

  it("injects same-host tabs for scope all", () => {
    assert.equal(shouldInjectForTab("all", "https://app.test/x", target, []), true);
    assert.equal(shouldInjectForTab("all", "https://other.test/", target, []), false);
    assert.equal(shouldInjectForTab("all", "https://app.test/", null, []), false);
  });

  it("injects allowlist matches", () => {
    assert.equal(
      shouldInjectForTab("allowlist", "https://a.staging.test/", target, ["staging.test"]),
      true
    );
    assert.equal(
      shouldInjectForTab("allowlist", "https://prod.test/", target, ["staging.test"]),
      false
    );
  });

  it("injects current-tab hostname matches", () => {
    assert.equal(
      shouldInjectForTab("currentTab", "http://app.test:3000/", target, []),
      true
    );
    assert.equal(
      shouldInjectForTab("currentTab", "http://other.test/", target, []),
      false
    );
  });
});

describe("buildRemovalFilter", () => {
  it("builds firefox host filters", () => {
    assert.deepEqual(buildRemovalFilter("all", null, [], true), { since: 0 });
    assert.deepEqual(
      buildRemovalFilter("currentTab", { hostname: "localhost", origin: "http://localhost:3000" }, [], true),
      { since: 0, hostnames: ["localhost"] }
    );
    assert.equal(buildRemovalFilter("allowlist", null, [], true), null);
    assert.deepEqual(buildRemovalFilter("allowlist", null, ["App.Test"], true), {
      since: 0,
      hostnames: ["app.test"]
    });
  });

  it("builds chrome origin filters", () => {
    assert.deepEqual(
      buildRemovalFilter("currentTab", { hostname: "x.test", origin: "https://x.test" }, [], false),
      { since: 0, origins: ["https://x.test"] }
    );
    assert.deepEqual(
      buildRemovalFilter("allowlist", null, ["App.Test"], false),
      { since: 0, origins: ["https://app.test", "http://app.test"] }
    );
  });

  it("enriches chrome origins from open tabs (ports / subdomains)", () => {
    const target = { hostname: "app.test", origin: "https://app.test" };
    assert.deepEqual(
      collectChromeOrigins("currentTab", target, [], ["http://app.test:3000/x"]),
      ["https://app.test", "http://app.test:3000"]
    );
    const allow = collectChromeOrigins(
      "allowlist",
      null,
      ["example.com"],
      ["https://a.example.com:8443/app"]
    );
    assert.ok(allow.includes("https://example.com"));
    assert.ok(allow.includes("http://example.com"));
    assert.ok(allow.includes("https://a.example.com:8443"));
  });
});
