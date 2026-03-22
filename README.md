# Crunchyroll Auto Skip Plus

Chrome extension that attempts to auto-skip the following on Crunchyroll:

- Recaps
- Intros
- Outros / credits
- Previews

Included features:

- Master switch
- Individual toggles
- Preview seek fallback when no skip button appears
- Adjustable fallback seek length
- Debug logging option

## Install

### From Chrome Web Store

Install from [Chrome Web Store](https://chromewebstore.google.com/detail/crunchyroll-auto-skip/aedaacijfoadiogdiehccepknbnhnecg)

### Manual Installation

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder
5. Refresh the Crunchyroll tab

## Supported Languages

The extension supports multiple languages. The language is automatically detected based on your browser's language settings. Currently supported:

- English (default)
- Spanish (Español)
- French (Français)
- German (Deutsch)

## Notes

This extension works by watching for visible skip controls and clicking them. The preview fallback additionally seeks the video forward near the end of an episode when preview-like text is detected on the page.

Crunchyroll can change its player UI at any time, so selectors and text matching may need maintenance later.
