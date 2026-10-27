"use strict";

const els = {
  enabled: document.getElementById("enabled"),
  interval: document.getElementById("interval"),
  clearOnNavigate: document.getElementById("clearOnNavigate"),
  extraClear: document.getElementById("extraClear"),
  clearNow: document.getElementById("clearNow"),
  status: document.getElementById("status")
};

function formatTime(ts) {
  if (!ts) return "هنوز پاک نشده";
  const d = new Date(ts);
  return "آخرین پاکسازی: " + d.toLocaleTimeString("fa-IR");
}

async function refresh() {
  const { settings, lastClearAt } = await browser.runtime.sendMessage({ type: "GET_STATE" });
  els.enabled.checked = !!settings.enabled;
  els.interval.value = settings.intervalSeconds;
  els.clearOnNavigate.checked = !!settings.clearOnNavigate;
  els.extraClear.checked = !!settings.extraClear;
  els.status.textContent = formatTime(lastClearAt);
}

async function pushSettings(partial) {
  const { lastClearAt } = await browser.runtime.sendMessage({
    type: "UPDATE_SETTINGS",
    settings: partial
  });
  els.status.textContent = formatTime(lastClearAt);
}

els.enabled.addEventListener("change", () => pushSettings({ enabled: els.enabled.checked }));
els.clearOnNavigate.addEventListener("change", () =>
  pushSettings({ clearOnNavigate: els.clearOnNavigate.checked })
);
els.extraClear.addEventListener("change", () => pushSettings({ extraClear: els.extraClear.checked }));

els.interval.addEventListener("change", () => {
  let v = parseInt(els.interval.value, 10);
  if (!Number.isFinite(v) || v < 1) v = 1;
  if (v > 600) v = 600;
  els.interval.value = v;
  pushSettings({ intervalSeconds: v });
});

els.clearNow.addEventListener("click", async () => {
  els.clearNow.disabled = true;
  els.clearNow.textContent = "در حال پاک کردن...";
  const { ok, lastClearAt } = await browser.runtime.sendMessage({ type: "CLEAR_NOW" });
  els.status.textContent = ok ? formatTime(lastClearAt) : "خطا در پاکسازی";
  els.clearNow.disabled = false;
  els.clearNow.textContent = "پاک کردن الان";
});

refresh();
