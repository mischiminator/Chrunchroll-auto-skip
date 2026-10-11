# Crunchyroll Auto Skip

A Chrome Manifest V3 extension that attempts to click Crunchyroll's visible skip controls for recaps, intros/openings, outros/endings/credits, and next-episode previews.

**It clicks existing controls. It does not detect segment timestamps or seek the video when a skip button is missing.** Availability depends on the episode, button wording, and Crunchyroll's player UI. The source manifest currently declares **1.6.1**; this is not a statement about the version published in the store.

## Installation

### Chrome Web Store

[Open the extension's Chrome Web Store page](https://chromewebstore.google.com/detail/crunchyroll-auto-skip/aedaacijfoadiogdiehccepknbnhnecg).

### Manual installation

1. Download and extract this repository, or clone it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Refresh existing Crunchyroll tabs.

After changing extension code, reload the extension and refresh the player again. No build step or Node.js installation is required to use the extension.

## Settings and defaults

Open the extension popup to change settings:

| Setting | Default | Actual behavior |
| --- | --- | --- |
| Master switch | On | Enables/disables new skip attempts; a previously scheduled click can still fire (see below). |
| Recaps | On | Clicks a recognized visible recap control without an intentional delay. |
| Intros | On | Clicks a recognized intro/opening control after the configured delay. |
| Outros | On | Clicks a recognized outro/ending/credits control after the configured delay. |
| Previews | On | Clicks a recognized preview control without an intentional delay; no seek fallback. |
| Skip delay | 3 seconds | 0–10 seconds, **only for intros/outros**. Zero means no delay, despite a popup display bug. |
| Disable-skip hotkey | D | Single-character key to suppress the currently detected segment type. |
| Popup language | Browser language, or English | English, German, Spanish, French; manual selection is saved. |

Language, delay, and hotkey controls are under **Advanced**. Preferences use `chrome.storage.sync`; Chrome can synchronize them when browser sync is available. Player settings changes normally reach already open matching tabs.

### Temporarily keep a segment

While a recognized control is present, press **D** or your configured key before it is clicked. This cancels a pending delay and suppresses that segment type until no eligible controls remain or the detected type changes. It is not a global pause and does nothing before a control is detected. Immediate skips may happen before you have time to press the key.

Ctrl, Alt, and Meta combinations are ignored; uppercase/Shift is accepted. Inputs, textareas, and directly editable elements are excluded, but nested editable descendants have a known bug. The player frame needs keyboard focus to receive the shortcut.

## How detection works

- HTTPS content scripts are injected into matching `www.crunchyroll.com`, `crunchyroll.com`, and `static.crunchyroll.com` frames.
- Detection runs only when **the injected frame's own URL contains `watch`**. This is a substring check, not an exact route parser.
- DOM changes trigger checks; controls are also polled approximately every 700 ms, and URL changes every 300 ms.
- Button-like elements and accessible open shadow roots are inspected. Normalized text, accessible labels, titles, and test identifiers are matched against segment terms in English, German, Spanish, and French.
- Elements without area, or with `display:none`, `visibility:hidden`, `opacity:0`, or `pointer-events:none`, are ignored.
- Intro/outro timers re-find a matching visible control before clicking. Identical segment/text/position keys are throttled for 2.5 seconds, not permanently suppressed.

Text matching is broad substring matching, not a guarantee that the element is a skip action. Crunchyroll UI changes may require selector maintenance.

## Known issues in the current source

Validation reproduced these problems; **this documentation update does not fix them**:

- **Master off does not cancel an already scheduled intro/outro click.** One pending click can still fire. The hotkey cancels a pending skip while a recognized control is present; do not rely on the master switch for immediate cancellation.
- Controls in static player frames without `watch` in their URL, and inherited-host `about:blank` frames, are not handled despite manifest injection support.
- Broad matching can click unrelated buttons, such as “Open preview details”.
- Hotkey suppression can carry into the next episode if URL/control replacement happens without an observed gap in eligible controls.
- Key events on nested descendants of contenteditable containers can incorrectly trigger suppression.
- Translation removes the Advanced arrow; opening/closing still changes the collapsed state, but clicking produces a JavaScript error.
- A saved zero-second delay works in the player, but reopening the popup displays **3**. Committing/blurring that displayed value can overwrite zero.
- Shortcut help remains **D** even when a different configured key works.
- Locale key sets differ because some retain unused fallback-seek strings; this does not represent an implemented feature.

There is **no preview seek fallback, fallback-seek duration setting, debug toggle, timestamp database, or guaranteed skip coverage**. Console logging is unconditional and can include page URLs, control text, and changed player settings.

## Permissions and privacy

`storage` saves preferences. Access to the three Crunchyroll origins above lets content scripts inspect and click controls. Current source has no analytics, remote executable code, or extension-operated backend. Preferences can pass through Chrome's own sync service. This source review does not certify Google's or Crunchyroll's data handling.

## Development and validation

The extension needs no build. For the test suite, use Node.js 20 or newer:

```sh
npm ci --include=dev
npm run test:install-browser
npm test
```

On Linux, Chromium also requires its OS libraries; on an authorized test machine these can be installed with `npx playwright install-deps chromium`.

Tests load the **actual unpacked extension** in Chromium using real storage, i18n, content-script injection, frames, and DOM behavior. Network-delivered player pages are controlled fixtures, not the live Crunchyroll service. Results are written to `test-results/functional.json`. **Known failures remain failures and make `npm test` exit nonzero.** Test dependencies are not extension runtime dependencies.

Static checks:

```sh
node --check content.js
node --check popup.js
node --check tests/functional.mjs
python3 -c 'import json; from pathlib import Path; paths = [Path("manifest.json"), *sorted(Path("_locales").glob("*/messages.json"))]; [json.loads(p.read_text()) for p in paths]; print("Validated", len(paths), "JSON files")'
git diff --check
```

See the [functional validation report](docs/FUNCTIONAL_VALIDATION.md) and [draft Chrome Web Store copy](docs/CHROME_WEB_STORE.md). Authenticated live playback, DRM, current live selectors, cross-device sync, and the installed store package have **not** been validated by the fixture tests.

### Release workflow caveat

The default branch is `master`, but `.github/workflows/release.yaml` automatically triggers only on pushes to `main` (or manual dispatch). It runs on a self-hosted runner and uses `git archive`, so every tracked file is included in release ZIPs. This update does not alter the workflow, publish a release, or edit the live store listing.

## License

See [LICENSE](LICENSE).
