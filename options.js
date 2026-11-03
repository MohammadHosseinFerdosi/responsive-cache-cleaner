"use strict";

const els = {
  enabled: document.getElementById("enabled"),
  interval: document.getElementById("interval"),
  clearOnNavigate: document.getElementById("clearOnNavigate"),
  scope: document.getElementById("scope"),
  allowlistSection: document.getElementById("allowlistSection"),
  allowlist: document.getElementById("allowlist"),
  addCurrentHost: document.getElementById("addCurrentHost"),
  clearHttpCache: document.getElementById("clearHttpCache"),
  clearCacheStorage: document.getElementById("clearCacheStorage"),
  clearServiceWorkers: document.getElementById("clearServiceWorkers"),
  clearLocalStorage: document.getElementById("clearLocalStorage"),
  clearIndexedDB: document.getElementById("clearIndexedDB"),
  clearCookies: document.getElementById("clearCookies"),
  hardReloadOnManual: document.getElementById("hardReloadOnManual"),
  hardReloadOnAuto: document.getElementById("hardReloadOnAuto"),
  hardReloadMatchingTabs: document.getElementById("hardReloadMatchingTabs"),
  badgeFlashOnClear: document.getElementById("badgeFlashOnClear"),
  presetQa: document.getElementById("presetQa"),
  presetSw: document.getElementById("presetSw"),
  status: document.getElementById("status"),
  error: document.getElementById("error")
};

function showError(message) {
  if (!message) {
    els.error.hidden = true;
    els.error.textContent = "";
    return;
  }
  els.error.hidden = false;
  els.error.textContent = message;
}

function readAllowlistText() {
  return els.allowlist.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function applyState(state) {
  const s = state.settings;
  els.enabled.checked = !!s.enabled;
  els.interval.value = String(s.intervalSeconds);
  els.clearOnNavigate.checked = !!s.clearOnNavigate;
  els.scope.value = s.scope || "all";
  els.allowlist.value = (s.allowlist || []).join("\n");
  els.clearHttpCache.checked = !!s.clearHttpCache;
  els.clearCacheStorage.checked = !!s.clearCacheStorage;
  els.clearServiceWorkers.checked = !!s.clearServiceWorkers;
  els.clearLocalStorage.checked = !!s.clearLocalStorage;
  els.clearIndexedDB.checked = !!s.clearIndexedDB;
  els.clearCookies.checked = !!s.clearCookies;
  els.hardReloadOnManual.checked = !!s.hardReloadOnManual;
  els.hardReloadOnAuto.checked = !!s.hardReloadOnAuto;
  els.hardReloadMatchingTabs.checked = !!s.hardReloadMatchingTabs;
  els.badgeFlashOnClear.checked = !!s.badgeFlashOnClear;
  els.status.textContent = state.lastClearAt
    ? `Last clear: ${new Date(state.lastClearAt).toLocaleString()}`
    : "No clears recorded yet in this profile";
  showError(state.lastError || "");
}

async function refresh() {
  const state = await browser.runtime.sendMessage({ type: "GET_STATE" });
  applyState(state);
}

async function pushSettings(partial) {
  const state = await browser.runtime.sendMessage({
    type: "UPDATE_SETTINGS",
    settings: partial
  });
  applyState(state);
}

els.enabled.addEventListener("change", () => pushSettings({ enabled: els.enabled.checked }));
els.clearOnNavigate.addEventListener("change", () =>
  pushSettings({ clearOnNavigate: els.clearOnNavigate.checked })
);
els.hardReloadOnManual.addEventListener("change", () =>
  pushSettings({ hardReloadOnManual: els.hardReloadOnManual.checked })
);
els.hardReloadOnAuto.addEventListener("change", () =>
  pushSettings({ hardReloadOnAuto: els.hardReloadOnAuto.checked })
);
els.hardReloadMatchingTabs.addEventListener("change", () =>
  pushSettings({ hardReloadMatchingTabs: els.hardReloadMatchingTabs.checked })
);
els.badgeFlashOnClear.addEventListener("change", () =>
  pushSettings({ badgeFlashOnClear: els.badgeFlashOnClear.checked })
);

els.interval.addEventListener("change", () => {
  let v = parseInt(els.interval.value, 10);
  if (!Number.isFinite(v) || v < 1) v = 1;
  if (v > 600) v = 600;
  els.interval.value = String(v);
  pushSettings({ intervalSeconds: v });
});

els.scope.addEventListener("change", () => pushSettings({ scope: els.scope.value }));
els.allowlist.addEventListener("change", () =>
  pushSettings({ allowlist: readAllowlistText() })
);

els.addCurrentHost.addEventListener("click", async () => {
  const state = await browser.runtime.sendMessage({ type: "ADD_CURRENT_TO_ALLOWLIST" });
  applyState(state);
  if (!state.ok) showError(state.lastError || "Could not add site");
});

els.presetQa.addEventListener("click", async () => {
  applyState(
    await browser.runtime.sendMessage({ type: "APPLY_PRESET", preset: "qa" })
  );
});

els.presetSw.addEventListener("click", async () => {
  applyState(
    await browser.runtime.sendMessage({ type: "APPLY_PRESET", preset: "swBust" })
  );
});

for (const key of [
  "clearHttpCache",
  "clearCacheStorage",
  "clearServiceWorkers",
  "clearLocalStorage",
  "clearIndexedDB",
  "clearCookies"
]) {
  els[key].addEventListener("change", () => pushSettings({ [key]: els[key].checked }));
}

refresh().catch((err) => showError(err?.message || String(err)));
