"use strict";

const els = {
  enabled: document.getElementById("enabled"),
  interval: document.getElementById("interval"),
  clearOnNavigate: document.getElementById("clearOnNavigate"),
  scope: document.getElementById("scope"),
  allowlistSection: document.getElementById("allowlistSection"),
  allowlist: document.getElementById("allowlist"),
  allowlistHint: document.getElementById("allowlistHint"),
  addCurrentHost: document.getElementById("addCurrentHost"),
  clearHttpCache: document.getElementById("clearHttpCache"),
  clearCacheStorage: document.getElementById("clearCacheStorage"),
  clearServiceWorkers: document.getElementById("clearServiceWorkers"),
  clearLocalStorage: document.getElementById("clearLocalStorage"),
  clearIndexedDB: document.getElementById("clearIndexedDB"),
  clearCookies: document.getElementById("clearCookies"),
  hardReloadOnManual: document.getElementById("hardReloadOnManual"),
  hardReloadOnAuto: document.getElementById("hardReloadOnAuto"),
  clearNow: document.getElementById("clearNow"),
  clearReload: document.getElementById("clearReload"),
  presetQa: document.getElementById("presetQa"),
  presetSw: document.getElementById("presetSw"),
  openOptions: document.getElementById("openOptions"),
  status: document.getElementById("status"),
  detail: document.getElementById("detail"),
  error: document.getElementById("error")
};

const REASON_LABELS = {
  manual: "manual",
  interval: "timer",
  navigate: "navigation"
};

function formatStatus(lastClearAt, lastClearReason) {
  if (!lastClearAt) return "Not cleared yet in this profile";
  const when = new Date(lastClearAt).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const ageSec = Math.max(0, Math.round((Date.now() - lastClearAt) / 1000));
  const age =
    ageSec < 60 ? `${ageSec}s ago` : `${Math.round(ageSec / 60)}m ago`;
  const reason = REASON_LABELS[lastClearReason] || lastClearReason || "";
  return `Last cleared ${age} · ${when}${reason ? ` · ${reason}` : ""}`;
}

function showError(message) {
  if (!message) {
    els.error.hidden = true;
    els.error.textContent = "";
    return;
  }
  els.error.hidden = false;
  els.error.textContent = message;
}

function showDetail(detail) {
  const summary =
    detail && typeof detail === "object"
      ? detail.summary || ""
      : "";
  if (!summary) {
    els.detail.hidden = true;
    els.detail.textContent = "";
    return;
  }
  els.detail.hidden = false;
  els.detail.textContent = summary;
}

function syncAllowlistVisibility() {
  els.allowlistSection.hidden = els.scope.value !== "allowlist";
}

function updateAllowlistHint(list) {
  const n = Array.isArray(list) ? list.length : 0;
  els.allowlistHint.textContent =
    n === 0
      ? "One hostname per line. Use “Add current site” or type hosts manually."
      : `${n} domain${n === 1 ? "" : "s"} — subdomains match parent entries.`;
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
  els.status.textContent = formatStatus(state.lastClearAt, state.lastClearReason);
  showDetail(state.lastClearDetail);
  showError(state.lastError || "");
  syncAllowlistVisibility();
  updateAllowlistHint(s.allowlist);
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

els.interval.addEventListener("change", () => {
  let v = parseInt(els.interval.value, 10);
  if (!Number.isFinite(v) || v < 1) v = 1;
  if (v > 600) v = 600;
  els.interval.value = String(v);
  pushSettings({ intervalSeconds: v });
});

els.scope.addEventListener("change", () => {
  syncAllowlistVisibility();
  pushSettings({ scope: els.scope.value });
});

els.allowlist.addEventListener("change", () => {
  pushSettings({ allowlist: readAllowlistText() });
});

els.addCurrentHost.addEventListener("click", async () => {
  const state = await browser.runtime.sendMessage({ type: "ADD_CURRENT_TO_ALLOWLIST" });
  applyState(state);
  if (!state.ok) showError(state.lastError || "Could not add site");
});

els.presetQa.addEventListener("click", async () => {
  const state = await browser.runtime.sendMessage({
    type: "APPLY_PRESET",
    preset: "qa"
  });
  applyState(state);
});

els.presetSw.addEventListener("click", async () => {
  const state = await browser.runtime.sendMessage({
    type: "APPLY_PRESET",
    preset: "swBust"
  });
  applyState(state);
});

els.openOptions.addEventListener("click", () => {
  browser.runtime.sendMessage({ type: "OPEN_OPTIONS" });
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

async function runClear(hardReload) {
  const buttons = [els.clearNow, els.clearReload];
  buttons.forEach((b) => {
    b.disabled = true;
  });
  const previousNow = els.clearNow.textContent;
  const previousReload = els.clearReload.textContent;
  els.clearNow.textContent = "Clearing…";
  try {
    const payload = { type: "CLEAR_NOW" };
    if (typeof hardReload === "boolean") payload.hardReload = hardReload;
    const state = await browser.runtime.sendMessage(payload);
    applyState(state);
    if (!state.ok) {
      showError(state.lastError || "Clear failed");
    }
  } catch (err) {
    showError(err?.message || String(err));
  } finally {
    els.clearNow.textContent = previousNow;
    els.clearReload.textContent = previousReload;
    buttons.forEach((b) => {
      b.disabled = false;
    });
  }
}

// Omit hardReload so background respects the "Hard reload after Clear now" setting.
els.clearNow.addEventListener("click", () => runClear(undefined));
els.clearReload.addEventListener("click", () => runClear(true));

refresh().catch((err) => showError(err?.message || String(err)));
