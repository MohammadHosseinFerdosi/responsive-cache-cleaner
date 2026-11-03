# Responsive Cache Cleaner

Firefox extension for **responsive and layout QA**: keep CSS, JS, and images fresh while you resize, reload, and iterate. It clears on a timer, before navigations, and on demand — without wiping cookies or storage unless you opt in.

**Version:** 2.1.0 · **Manifest:** V3 · **Requires:** Firefox 140+ · **License:** MIT

## Why

During responsive testing, HTTP cache and Cache Storage often serve stale assets after a deploy or local rebuild. DevTools “Disable cache” only helps while DevTools stays open. This add-on keeps caches empty for the testing session so every reload reflects the latest files.

## Features

- Auto clear on interval (default every 5 seconds)
- Clear before top-level navigation / reload
- Selective types: HTTP cache, Cache Storage (Cache API), optional Service Workers / localStorage / IndexedDB / cookies
- Scope: entire browser · current tab site · domain allowlist
- One-click **Clear now** and **Clear + hard reload**
- Toolbar context menu + shortcuts: `Alt+Shift+C` clear · `Alt+Shift+R` clear + hard reload
- Popup status (last clear time, reason, errors) and toolbar badge (`ON` / `off`)
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
| `alarms` | Periodic clear timer |
| `webNavigation` | Clear immediately before navigations |
| `tabs` | Active tab URL for scoping and hard reload |
| `storage` | Persist settings and last-clear status |
| `contextMenus` | Toolbar right-click: clear / clear + hard reload |
| `<all_urls>` | Scoped clears and page injection on http(s) sites |

No telemetry. Settings stay in `browser.storage.local` on this profile only.

## How to use

1. Pin the toolbar icon and open the popup.
2. Leave **Auto clear enabled** on during a responsive QA session.
3. Prefer **Current tab site** or an **allowlist** (`localhost`, staging hosts) when storage clears should not touch other sites.
4. Use **Clear + hard reload** after a frontend deploy if a service worker may still control the page.
5. Turn the master switch **off** when finished so normal caching returns.

### Firefox API notes

- Clearing **HTTP cache** via `browsingData` is **always global** on Firefox; hostname filters do not limit it. Scope modes still limit cookies, storage, service worker registrations, and injected Cache Storage clears.
- Firefox rejects a `cacheStorage` browsingData key. This extension clears Cache API entries with a page script in the tab.
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
| `lib/` | Settings, scope, clear-type helpers |
| `test/` | Unit tests |
| `icons/` | Toolbar icons |

## Niche comparison

| Capability | This extension | [cssnr/cache-cleaner](https://github.com/cssnr/cache-cleaner) | [Clear Cache](https://github.com/isaiasgv/ClearCache) | One-click hard-reload tools |
| --- | --- | --- | --- | --- |
| Continuous timer while testing | Yes | No | No | No |
| Clear on every navigation | Yes | No | No | No |
| Clear + hard reload | Yes | Yes | Yes | Yes |
| Cache Storage on Firefox | Inject | Inject | Limited (deep modes) | Often limited |
| Allowlist / current-tab scope | Yes | Site or browser | Site data modes | Current site |
| Toolbar context menu | Yes | Yes | Yes | Varies |
| Responsive QA defaults | Yes | General | General | One-shot |

**Delta:** competitors focus on one-shot clear/reload. This extension is built for continuous responsive/layout QA — timer + navigation hooks keep assets fresh without leaving DevTools open.

## Changelog

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
