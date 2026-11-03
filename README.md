# Responsive Cache Cleaner

Firefox **and** Chrome extension for **responsive and layout QA**: keep CSS, JS, and images fresh while you resize, reload, and iterate. It clears on a timer, before navigations, and on demand — without wiping cookies or storage unless you opt in.

**Version:** 2.3.1 · **Manifest:** V3 · **Requires:** Firefox 140+ (Android 142+) · Chrome 109+ · **License:** MIT

**Stores:** [Firefox AMO](https://addons.mozilla.org/firefox/addon/responsive-test-cache-cleaner/) · Chrome Web Store (see listing after publish)

## Why

During responsive testing, HTTP cache and Cache Storage often serve stale assets after a deploy or local rebuild. DevTools “Disable cache” only helps while DevTools stays open. This add-on keeps caches empty for the testing session so every reload reflects the latest files.

## Features

- Auto clear on interval (default every 5 seconds)
- Clear before top-level navigation / reload
- Selective types: HTTP cache, Cache Storage (Cache API), optional Service Workers / localStorage / IndexedDB / cookies
- **Firefox:** Cache Storage / SW injection across matching open tabs
- **Chrome:** Cache Storage / SW via `browsingData` with `origins` (enriched from open tabs for ports/subdomains)
- Scope: entire browser · current tab site · domain allowlist
- Allowlist UX: add current site (popup, options, page context menu)
- QA presets: defaults · defaults + Service Workers
- One-click **Clear now** and **Clear + hard reload**
- Optional hard-reload of other matching open tabs
- Toolbar / page context menus + shortcuts: `Alt+Shift+C` clear · `Alt+Shift+R` clear + hard reload
- Popup status (relative time, reason, clear summary) and toolbar badge (`ON` / `off`, flashes `OK` / `!`)
- Options page for full settings and browser API notes
- QA defaults: HTTP cache + Cache Storage on; cookies and storage off
- Single codebase — `chrome.*` / `browser.*` compat layer (`lib/browser-api.js`)

## Install (temporary)

### Firefox

1. Firefox → `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
2. Select `manifest.json` from this folder

Package a Firefox zip with `npm run build` for AMO submission.

### Chrome / Chromium

1. Chrome → `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder (the one containing `manifest.json`)
3. Or install from the Chrome Web Store once listed

Package a Chrome zip with `npm run build:chrome` for Chrome Web Store upload (excludes `node_modules`, `test`, `scripts`, `web-ext-artifacts`).

## Permissions

| Permission | Purpose |
| --- | --- |
| `browsingData` | Clear HTTP cache and optional site data |
| `scripting` | Inject Cache Storage / Service Worker cleanup on Firefox (and matching-tab helpers) |
| `alarms` | Periodic clear timer and badge restore |
| `webNavigation` | Clear immediately before navigations |
| `tabs` | Active tab URL for scoping, multi-tab inject, hard reload |
| `storage` | Persist settings and last-clear status |
| `contextMenus` | Toolbar / page: clear, clear + hard reload, add to allowlist |
| `<all_urls>` | Scoped clears and page injection on http(s) sites |

No telemetry. Settings stay in extension `storage.local` on this profile only.

## How to use

1. Pin the toolbar icon and open the popup (or open **Options**).
2. Leave **Auto clear enabled** on during a responsive QA session.
3. Prefer **Current tab site** or an **allowlist** (`localhost`, staging hosts) when storage clears should not touch other sites. Use **Add current site** to grow the allowlist quickly.
4. Use **Clear + hard reload** after a frontend deploy if a service worker may still control the page. Enable **Also hard-reload other matching open tabs** in Options when you keep several tabs on the same host.
5. Turn the master switch **off** when finished so normal caching returns.

### Browser API notes

- Clearing **HTTP cache** via `browsingData` is **always global** on Firefox and Chromium; host/origin filters do not limit it. Scope modes still limit cookies, storage, service workers, and Cache Storage.
- **Firefox** rejects a `cacheStorage` browsingData key. Cache API entries are cleared with a page script on **matching open tabs**.
- **Chrome** supports `cacheStorage` and `serviceWorkers` via browsingData with **`origins`** (not Firefox `hostnames`). Open-tab URLs enrich the origin list so ports and live subdomains are included.
- **Firefox MV3** uses a non-persistent background **event page** (`background.scripts` + `type: module`).
- **Chrome MV3** uses a module **service worker** (`background.service_worker`). Periodic `alarms` are throttled (~1/min); sub-minute intervals use an in-worker timer while the SW is awake, plus a 1-minute alarm wake-up.
- Rebind shortcuts: Firefox `about:addons` → Manage Extension Shortcuts · Chrome `chrome://extensions/shortcuts`.

## Development

```bash
npm test
npm run check:syntax
npm run lint
npm run build
npm run build:chrome
```

| Path | Purpose |
| --- | --- |
| `manifest.json` | Dual-browser MV3 manifest |
| `background.js` | Alarms, navigation hooks, clear orchestration |
| `popup.*` | Toolbar popup |
| `options.*` | Full options page |
| `lib/` | Settings, scope, clear-type, browser API helpers |
| `scripts/pack-chrome.mjs` | Chrome Web Store zip packer |
| `test/` | Unit tests |
| `icons/` | Toolbar icons (incl. 128px for Chrome) |

## Niche comparison

| Capability | This extension | [cssnr/cache-cleaner](https://github.com/cssnr/cache-cleaner) | [Clear Cache (TenSoja)](https://github.com/TenSoja/clear-cache) | [ClearCache](https://github.com/isaiasgv/ClearCache) / hard-reload tools |
| --- | --- | --- | --- | --- |
| Continuous timer while testing | Yes | No | No | No |
| Clear on every navigation | Yes | No | No | No |
| Clear + hard reload | Yes | Yes | Yes | Yes |
| Cache Storage on Firefox | Multi-tab inject | Site inject | Limited | Often limited / deep modes |
| Chrome + Firefox single codebase | Yes | Varies | Varies | Varies |
| Allowlist + add-current UX | Yes | Site or browser | Site-data modes | Site / subdomain modes |
| Options page | Yes | Yes | Yes | Often none |
| Page / tab context menus | Yes | Yes | Yes | Varies |
| Badge / last-clear feedback | OK flash + summary | Varies | Failures / warnings | Toast / badge |
| Time-range privacy clears | No (QA-focused) | Planned | Yes | Deep modes |
| Responsive QA defaults | Yes | General | General | One-shot |

**Delta:** competitors optimize one-shot clear/reload (or privacy wipes). This extension is built for continuous responsive/layout QA — timer + navigation hooks, multi-tab Cache Storage busting, and allowlist workflows without leaving DevTools open.

## Chrome Web Store listing (copy)

**Name:** Responsive Cache Cleaner  
**Short name / alt:** Responsive Test Cache Cleaner  
**Category:** Developer Tools  

**Summary:** Keep HTTP cache and Cache Storage fresh during responsive and layout QA — timer, navigation hooks, scoped clears, and hard reload.

**Description:**

Responsive Cache Cleaner is built for frontend and QA engineers who resize, reload, and iterate on layouts. Stale CSS/JS/images from HTTP cache or the Cache API waste time; DevTools “Disable cache” only helps while DevTools stays open.

This extension clears on a timer (default every 5 seconds), before top-level navigations, and on demand. Choose HTTP cache, Cache Storage, and optional service workers, localStorage, IndexedDB, or cookies. Scope clears to the entire browser, the current tab’s site, or a domain allowlist. Use Clear now or Clear + hard reload from the popup, shortcuts (Alt+Shift+C / Alt+Shift+R), or the page/toolbar context menu.

Works on Chrome and Chromium (Manifest V3). No telemetry — settings stay in this browser profile only.

## Changelog

### 2.3.1

- Gate background handlers until settings load (service-worker race fix)
- Chrome badge restore via in-worker timer (+ alarm backup); skip redundant wake clears
- Skip empty-allowlist interval clears; hide options allowlist until scope needs it
- Harden host normalization; expand unit tests (browser-api, scope, clear-types)

### 2.3.0

- Chrome / Chromium support (MV3 service worker) alongside Firefox
- Chromium `origins` filters for scoped browsingData; enrich from open tabs
- Compat layer for `chrome.*` / `browser.*`; Chrome-safe context menu contexts
- Sub-minute timer on Chrome via in-worker timer + alarm wake-up
- `npm run build:chrome` packer; 128px icon; README Chrome install + store copy

### 2.2.0

- Multi-tab Cache Storage / Service Worker injection for matching hosts
- Options page; QA presets; allowlist “Add current site”
- Page/tab context menus (clear, clear + reload, add to allowlist)
- Badge flash (`OK` / `!`) and richer last-clear summary in the popup
- Optional hard-reload of other matching open tabs
- Unit tests for presets, injection scope, and clear summaries

### 2.1.0

- Toolbar context menu (clear / clear + hard reload)
- Popup toggle for hard reload after timer clears
- README polish and competitor comparison

### 2.0.0

- Manifest V3 event page
- Selective clear types + Cache Storage injection
- Scope: all / current tab / allowlist
- Hard reload, commands, badge, error surfacing
- Automated tests and MIT license

### 1.0.0

- Initial MV2 timer + navigate clearer

## License

MIT — see [LICENSE](LICENSE).
