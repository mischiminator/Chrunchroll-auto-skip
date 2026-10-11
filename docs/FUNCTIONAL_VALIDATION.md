# Functional validation of the current extension

## Scope and result

Runtime source under test: commit `a2f17837baad878a05ddc80af5e7e519a11d5e39`, manifest version **1.6.1**. This PR changes documentation and adds tests; it does **not** fix extension runtime code.

The completed browser run recorded **72 checks: 62 passed, 10 failed** in Playwright 1.64.0 / bundled Chromium **156.0.8078.4**. See [the complete result snapshot](validation-results.json) for every test name, status, and failure message. `npm test` exits **1**, intentionally, because real failures are not converted into passing expectations.

The actual unpacked extension was loaded into an isolated Chromium profile. Its original manifest, JavaScript, popup HTML/CSS, locale files, content-script injection, and real `chrome.storage.sync` / `chrome.i18n` APIs were used. `chrome://extensions` confirmed it was enabled with no manifest errors or install warnings. Network requests were intercepted to supply controlled Crunchyroll-origin player pages; no third-party account or actual episode was used. The profile is removed on exit.

## Verified working in controlled browser fixtures

- All four segment categories recognized with representative English, German, Spanish, and French labels (16 cases, not an exhaustive catalogue of live labels).
- Per-segment switches and master-off prevention of **new** skip attempts.
- Zero-delay player behavior and nonzero intro/outro delay; recap/preview attempts do not use that delay.
- Invisible/noninteractive control exclusions, controls becoming visible, ARIA-labelled role buttons with real dimensions, and accessible open shadow roots.
- Detached controls are not clicked by pending timers. Disabling the segment cancels the eligible pending action in the tested timing scenario.
- Default, customized, and uppercase hotkeys cancel pending skips. Ctrl-modified hotkey is ignored. Direct input, textarea, and contenteditable targets are excluded.
- Suppression resets after an observed disappearance of eligible controls; repeated same-key clicks are throttled for 2.5 seconds.
- Settings changes reach an already open player.
- SPA pushState/replaceState navigation starts detection; navigating away cancels a pending timer.
- A matched static frame **with `watch` in its own URL** handles a control; a non-Crunchyroll fixture does not run skip logic.
- Plain preview text does not cause a video seek. This confirms the absence of a seek fallback, not successful preview timestamp detection.
- Popup defaults, master/segment toggles, stored changes after reload, four-language visible text with no unresolved placeholders, language selection persistence, delay saving, customized key saving, and GitHub link navigation.

## Reproduced failures and root causes

| Test | Reproduction and observed result | Cause in current source |
| --- | --- | --- |
| Master off cancels an already pending skip | Schedule an intro at a one-second delay, turn master off after 200 ms, keep the button present. It is clicked anyway. | `runSkipCheck()` returns early when disabled without clearing its timer; the timer callback does not recheck `settings.enabled`. |
| SPA episode change resets hotkey suppression | Suppress an intro, change to a new watch URL and replace the intro control in the same DOM task. The next intro never clicks in the observation window. | `start()`/`stop()` do not reset `ignoreCurrentSkipType` or `currentActiveSkipType`; a same-type replacement can retain suppression. |
| Unrelated preview-labelled control is not clicked | Insert a visible button labelled “Open preview details”. It is clicked. | `classify()` uses broad substring matching and `findButtons()` accepts all buttons, without requiring a skip action. |
| Static player frame without watch in URL can skip | A routed `https://static.crunchyroll.com/player` frame contains a visible recap control. No click occurs. | Injection matches, but `start()` rejects this frame because its own URL does not include `watch`. |
| Popup Advanced section opens/closes without errors | Click Advanced twice. State toggles but both clicks throw “Cannot set properties of null (setting 'textContent')”. | `translatePage()` replaces the header's `textContent`, deleting `.toggle-icon`; the click handler dereferences that missing child. |
| Popup preserves saved zero-second delay | Save zero, reload popup. Slider reads 3. | `String(settings.skipDelay || 3)` treats zero as absent. The player still reads zero correctly. |
| Popup help reflects custom hotkey | Save X, reopen popup. The input shows X and the key works, but explanatory text still says D. | `keyboardShortcut`/`keyboardShortcutHelp` messages hardcode D; no substitution uses `disableSkipHotkey`. |
| Nested editable descendant does not trigger override | Dispatch a bubbling D key event on a span inside a contenteditable container while an intro is pending. The pending click is suppressed. | The guard checks the target's own `contentEditable === "true"`, not inherited editability (`isContentEditable`). This is a synthetic keyboard-event regression fixture, not a claim about every native caret target. |
| About:blank child frame can skip inherited-host controls | Add an about:blank child under a watch page and insert a visible recap control. No click occurs. | The frame's own URL fails the same `watch` check despite `match_about_blank` / origin fallback being enabled. |
| Locale files share the same keys | Compare all four locale key sets. They differ on unused fallback-seek keys. | Stale `fallbackSeekLength` and `fallbackSeekLengthHelp` entries remain in some locales. Tested visible translations still render. |

The first harness run also exposed test-fixture issues: an empty ARIA-only div had no height, an empty main element was incorrectly awaited as visible, and a visually hidden checkbox was clicked directly rather than through its real label. Those harness issues were corrected before the recorded 72-check run. They are **not** reported as extension bugs.

## Running the checks

```sh
npm ci --include=dev
npm run test:install-browser
npm test
```

Use Node.js 20 or newer. The Chromium runtime needs its normal Linux libraries. The test-only npm dependency is pinned in the lockfile. Output is written to ignored `test-results/functional.json`; the checked-in snapshot under `docs/` is evidence of the recorded source revision, not automatically updated on future runs.

JavaScript syntax, manifest/locale JSON parsing, and Git whitespace checks were also executed. No CI workflow was added or dispatched. The existing release job targets pushes to `main`, although the default branch is `master`; that mismatch was inspected but not changed or exercised.

## What is not yet validated

This is broad functional coverage, **not proof of every possible browser or playback condition**. Remaining checks require an authenticated Crunchyroll session and/or other environments:

- Current real episode controls, their labels and selectors, actual iframe URLs, fullscreen behavior, DRM playback, autoplay, and episode transitions.
- Timing against real player events and native keyboard delivery while focus is inside real player frames and rich text editors.
- Current Chrome Web Store package, its installed version, dashboard metadata, screenshots, and privacy declarations.
- Cross-device Chrome sync, storage failures, extension invalidation, long-running performance/leaks, closed shadow roots, every available locale/control variant, browser-history back/forward and hash navigation, and other Chromium/browser versions.

Before publishing a new release: resolve the failed assertions, rerun the suite, load the candidate package manually, and exercise toggles, delay edges, hotkey cancellation, real preview controls, episode navigation, and all popup languages during actual playback. Do not describe the current extension as fully validated or bug-free.
