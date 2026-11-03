# Responsive Cache Cleaner

Firefox extension for **responsive and layout QA**: keep CSS, JS, and images fresh while you resize, reload, and iterate. It clears on a timer, before navigations, and on demand — without wiping cookies or storage unless you opt in.

**Version:** 2.2.0 · **Manifest:** V3 · **Requires:** Firefox 140+ (Android 142+) · **License:** MIT

## Why

During responsive testing, HTTP cache and Cache Storage often serve stale assets after a deploy or local rebuild. DevTools “Disable cache” only helps while DevTools stays open. This add-on keeps caches empty for the testing session so every reload reflects the latest files.

## Features

- Auto clear on interval (default every 5 seconds)
- Clear before top-level navigation / reload
- Selective types: HTTP cache, Cache Storage (Cache API), optional Service Workers / localStorage / IndexedDB / cookies
- **Cache Storage / SW injection across matching open tabs** (same host, allowlist, or current-tab site)
- Scope: entire browser · current tab site · domain allowlist
- Allowlist UX: add current site (popup, options, page/tab context menu)
- QA presets: defaults · defaults + Service Workers
- One-click **Clear now** and **Clear + hard reload**
- Optional hard-reload of other matching open tabs
- Toolbar / page / tab context menus + shortcuts: `Alt+Shift+C` clear · `Alt+Shift+R` clear + hard reload
- Popup status (relative time, reason, clear summary) and toolbar badge (`ON` / `off`, flashes `OK` / `!`)
- Options page for full settings and Firefox API notes
- QA defaults: HTTP cache + Cache Storage on; cookies and storage off

## Install (temporary)

1. Firefox → `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
2. Select `manifest.json` from this folder

Package a zip with `npm run build` for AMO submission.

## Permissions

| Permission | Purpose |
| --- | --- |
| `browsingData` | Clear HTTP cache and optional site data |
| `scripting` | Inject Cache Storage / Service Worker cleanup (Firefox has no `cacheStorage` browsingData type) |
| `alarms` | Periodic clear timer and badge restore |
| `webNavigation` | Clear immediately before navigations |
| `tabs` | Active tab URL for scoping, multi-tab inject, hard reload |
| `storage` | Persist settings and last-clear status |
| `contextMenus` | Toolbar / page / tab: clear, clear + hard reload, add to allowlist |
| `<all_urls>` | Scoped clears and page injection on http(s) sites |

No telemetry. Settings stay in `browser.storage.local` on this profile only.

## How to use

1. Pin the toolbar icon and open the popup (or open **Options**).
2. Leave **Auto clear enabled** on during a responsive QA session.
3. Prefer **Current tab site** or an **allowlist** (`localhost`, staging hosts) when storage clears should not touch other sites. Use **Add current site** to grow the allowlist quickly.
4. Use **Clear + hard reload** after a frontend deploy if a service worker may still control the page. Enable **Also hard-reload other matching open tabs** in Options when you keep several tabs on the same host.
5. Turn the master switch **off** when finished so normal caching returns.

### Firefox API notes

- Clearing **HTTP cache** via `browsingData` is **always global** on Firefox; hostname filters do not limit it. Scope modes still limit cookies, storage, service worker registrations, and injected Cache Storage clears.
- Firefox rejects a `cacheStorage` browsingData key. This extension clears Cache API entries with a page script on **matching open tabs** (active hostname / allowlist / current-tab site).
- Manifest V3 uses a non-persistent background **event page** (`background.scripts` + `type: module`). Extension service workers are not used on Firefox; that is expected.

## Development

```bash
npm test
npm run check:syntax
npm run lint
npm run build
```

| Path | Purpose |
| --- | --- |
| `manifest.json` | WebExtension manifest |
| `background.js` | Alarms, navigation hooks, clear orchestration |
| `popup.*` | Toolbar popup |
| `options.*` | Full options page |
| `lib/` | Settings, scope, clear-type helpers |
| `test/` | Unit tests |
| `icons/` | Toolbar icons |

## Niche comparison

| Capability | This extension | [cssnr/cache-cleaner](https://github.com/cssnr/cache-cleaner) | [Clear Cache (TenSoja)](https://github.com/TenSoja/clear-cache) | [ClearCache](https://github.com/isaiasgv/ClearCache) / hard-reload tools |
| --- | --- | --- | --- | --- |
| Continuous timer while testing | Yes | No | No | No |
| Clear on every navigation | Yes | No | No | No |
| Clear + hard reload | Yes | Yes | Yes | Yes |
| Cache Storage on Firefox | Multi-tab inject | Site inject | Limited | Often limited / deep modes |
| Allowlist + add-current UX | Yes | Site or browser | Site-data modes | Site / subdomain modes |
| Options page | Yes | Yes | Yes | Often none |
| Page / tab context menus | Yes | Yes | Yes | Varies |
| Badge / last-clear feedback | OK flash + summary | Varies | Failures / warnings | Toast / badge |
| Time-range privacy clears | No (QA-focused) | Planned | Yes | Deep modes |
| Responsive QA defaults | Yes | General | General | One-shot |

**Delta:** competitors optimize one-shot clear/reload (or privacy wipes). This extension is built for continuous responsive/layout QA — timer + navigation hooks, multi-tab Cache Storage busting, and allowlist workflows without leaving DevTools open.

## Changelog

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
