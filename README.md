# Crunchyroll Auto Skip

Watch Crunchyroll with fewer clicks. This Chrome extension automatically uses available skip buttons for recaps, intros, endings/credits and next-episode previews.

**It needs a suitable skip button to appear.** It doesn't detect scene boundaries or jump forward when a button is missing.

## Installation

### Chrome Web Store

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/crunchyroll-auto-skip/aedaacijfoadiogdiehccepknbnhnecg).

### Manual installation

1. Download and extract this repository, or clone it.
2. Open `chrome://extensions`.
3. Enable **Developer mode** and click **Load unpacked**.
4. Select the folder containing `manifest.json`.
5. Refresh your Crunchyroll tab.

No build step is required. After updating the files, reload the extension and refresh the player again.

## Settings

Open the extension popup to choose what you want to skip.

| Setting | Default | What it does |
| --- | --- | --- |
| Master switch | On | Turns automatic skipping on/off and cancels pending skips when switched off. |
| Recaps | On | Uses available recap skip buttons without an added delay. |
| Intros | On | Uses intro/opening skip buttons after your chosen delay. |
| Outros | On | Uses ending/credits skip buttons after your chosen delay. |
| Previews | On | Uses available preview skip buttons without an added delay. |
| Skip delay | 3 seconds | Choose 0–10 seconds for intros and endings only. |
| Disable-skip shortcut | D | Temporarily keeps the currently detected segment type. |
| Popup language | Browser language, or English | Choose English, German, Spanish or French. |

Language, delay and shortcut settings are under **Advanced**. Preferences are saved using Chrome's extension storage and can sync when browser sync is enabled. Player settings changes normally apply to open tabs without refreshing them.

## Want to watch an intro or ending?

Press **D**, or your chosen single-character key, while its skip button is showing and before the extension clicks it. This cancels a pending skip and keeps the currently detected segment type. Skipping normally resumes after the eligible controls disappear or a different segment type appears.

The shortcut is not a global pause. If skipping is immediate, it may happen before you have time to press the key. The player frame needs keyboard focus. Ctrl, Alt and Meta combinations are ignored; uppercase letters work too.

## What to expect

- Skipping depends on the episode, available skip buttons and Crunchyroll's player. It isn't guaranteed for every episode or player layout.
- The extension looks for both a segment label and a skip action, rather than treating every mention of an intro or preview as a skip button.
- It handles supported embedded Crunchyroll players as well as controls on watch pages. Changes to the site can still affect compatibility.
- Turning automatic skipping off cancels the pending countdown. Changing a skip setting restarts any pending countdown with the current settings.
- Zero seconds means no added delay, and the popup preserves that value. Shortcut instructions reflect your chosen key.
- The shortcut doesn't act while automatic skipping is off or no eligible control is present, and it ignores typing in editable fields.

There is no timestamp detection, preview seek fallback or debug switch. Existing console logging is always on.

## Permissions and privacy

The extension uses storage to save preferences and access to Crunchyroll pages to find and click controls. Current source contains no analytics or extension-operated backend. Chrome may sync preferences through its own service. Diagnostic console messages can include page URLs, button text and changed settings.

## Store listing copy

The proposed user-facing description is in [docs/CHROME_WEB_STORE.md](docs/CHROME_WEB_STORE.md).

## License

See [LICENSE](LICENSE).
