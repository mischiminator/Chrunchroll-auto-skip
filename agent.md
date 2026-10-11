# Agent guide

## Scope and project

This guide applies to the entire repository. This is a Chrome Manifest V3 extension that automatically clicks Crunchyroll skip controls for recaps, intros, outros, and previews. It uses plain JavaScript, HTML, and CSS with no build step, package manager configuration, or automated test suite currently checked in.

Keep changes focused on the requested task. Do not introduce a framework, build pipeline, dependency, or unrelated refactor without a clear need.

## Repository map

- `manifest.json`: extension metadata, permissions, popup entry point, and content-script injection rules.
- `content.js`: skip-control discovery, text classification, visibility checks, delayed skips, keyboard override, settings updates, and SPA navigation handling. It runs in matching frames and scans accessible shadow roots.
- `popup.html`, `popup.css`, `popup.js`: settings UI, persistence, and translation loading.
- `_locales/{en,de,es,fr}/messages.json`: translations for English, German, Spanish, and French.
- `icons/`: extension icons.
- `README.md`: installation and user-facing documentation.
- `.github/workflows/release.yaml`: self-hosted release job that tags and archives the repository.

## Implementation rules

- Follow the surrounding style; use small functions and descriptive names. No formatting-only churn.
- Keep the shared `DEFAULT_SETTINGS` values in `content.js` and `popup.js` synchronized. Preserve existing storage keys unless a migration is part of the task.
- Store settings through `chrome.storage.sync`; account for existing user settings and real-time updates.
- Preserve the master switch and per-segment toggles. Delayed actions must respect current settings, visibility, navigation, and the user's keyboard override when they execute.
- The current delay applies to intros and outros; recaps and previews are attempted immediately. Do not silently change that distinction.
- Preserve keyboard behavior in editable fields and avoid interfering with modified shortcuts.
- Treat Crunchyroll selectors and localized labels as unstable. Avoid clicking unrelated controls, duplicate clicks, unnecessary full-DOM scans, and leaked observers or timers.
- Preserve frame, shadow-root, and SPA navigation support when changing player logic.
- Keep popup IDs, JavaScript selectors, and translation keys consistent. Update all four locales when introducing user-facing text; do not leave raw translation placeholders.
- Keep Manifest V3 compatibility. Do not add remote executable code, secrets, telemetry, or broader host/API permissions without explicit approval.
- Do not bump the manifest version for documentation-only changes. Ask before publishing a release or changing release automation.

## Local verification

There is no build or `npm test` command in the current repository. Do not invent one. With Node.js and Python 3 available, run these checks from the repository root:

```sh
node --check content.js
node --check popup.js
python3 -c 'import json; from pathlib import Path; paths = [Path("manifest.json"), *sorted(Path("_locales").glob("*/messages.json"))]; [json.loads(p.read_text()) for p in paths]; print("Validated", len(paths), "JSON files")'
git diff --check
```

These are syntax/JSON/whitespace checks, not proof of working browser behavior. If adding automated tests, document how to run them and exercise the affected behavior.

### Manual browser checks for behavior changes

1. Open `chrome://extensions`, enable Developer mode, and load this repository as an unpacked extension (or reload the already loaded extension).
2. Refresh a Crunchyroll watch page. Check the extension popup and content-script console for errors.
3. Verify the master switch, each affected segment toggle, persistence after reopening the popup, and changes reaching an already open player.
4. For timing changes, test zero and nonzero delay, disappearing/replaced controls, disabling a pending skip, and the keyboard override while a skip is pending.
5. Verify that the override does not capture typing in editable fields and that skipping resumes after the segment ends.
6. Navigate between episodes without a full reload; check for stale timers, duplicate clicks, and observers that do not restart or stop correctly.
7. For UI/localization changes, check English, German, Spanish, and French, including switching the popup language.

If authenticated Crunchyroll playback is unavailable, report that limitation explicitly. Never claim live-player tests passed based only on static checks or mocked DOM tests.

## Known documentation and workflow caveats

- The README mentions preview seek fallback and a debug logging option, but the current active skip path does not implement those described features. Inspect code before promising support; do not treat stale documentation or unused helper functions/translation keys as working features.
- The default branch is currently `master`, while the release workflow's push trigger targets `main`. Do not fix this incidentally, dispatch the workflow, or create release tags as part of an unrelated task.
- The release ZIP is produced with `git archive HEAD`, so tracked documentation is included in that archive.

## Git workflow and handoff

- Fetch and inspect the current default branch before starting. Preserve existing user changes.
- Work on a dedicated branch, use focused conventional commits, and open a pull request against the current default branch (`master` at the time this guide was written).
- Do not push directly to the default branch, force-push, merge, deploy, publish releases, or modify repository settings without explicit approval.
- Never commit credentials, access tokens, local environment files, or generated artifacts unrelated to the task.
- In the pull request and final handoff, state what changed, which checks actually ran, and any remaining manual verification or limitations.
