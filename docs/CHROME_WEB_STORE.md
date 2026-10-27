# Chrome Web Store listings

Draft copy for all five supported interface languages. Not published.

Each language has its own file with the product name, short description and full description:

- [English (en)](chrome-web-store/en.md)
- [Deutsch (de)](chrome-web-store/de.md)
- [Español (es)](chrome-web-store/es.md)
- [Français (fr)](chrome-web-store/fr.md)
- [Português — Brasil (pt_BR)](chrome-web-store/pt_BR.md)

Copy the contents of each field separately into the corresponding localized Chrome Web Store listing. The document title, instructions and field headings are not part of the listing text.

The product name remains **Crunchyroll Auto Skip** in every language. These descriptions document the current extension; adding or editing them does not change its runtime translations or publish a store update.

## Screenshots

The five 1280×800 store screenshots (the store's maximum) are in [chrome-web-store/screenshots](chrome-web-store/screenshots). They show the real extension popup in its current state, so regenerate them after changing the popup, its texts or its translations:

```sh
python3 tools/store-screenshots/generate.py
```

The script needs only Python 3 and Google Chrome (set `CHROME` if Chrome is not in the default macOS location). Slide texts, popup settings and layout are defined in `tools/store-screenshots/slide.html`; pass slide numbers to render only some of them.
