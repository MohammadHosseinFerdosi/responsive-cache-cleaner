import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRemovalFilter,
  hostnameMatchesAllowlist,
  parseHttpUrl,
  shouldClearForUrl
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
  });
});
