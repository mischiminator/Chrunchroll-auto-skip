#!/usr/bin/env python3
"""Render the Chrome Web Store screenshots from the real popup.

The popup files are copied into a temporary folder next to slide.html, and a
small stand-in for the Chrome extension APIs lets popup.js apply translations
and settings as it does in the browser. Headless Chrome then captures each
slide at 1280x800 into docs/chrome-web-store/screenshots/.

Usage (from anywhere):
    python3 tools/store-screenshots/generate.py [slide numbers...]

Set CHROME to the Chrome binary if it is not in the default macOS location.
Requires only the Python standard library and Google Chrome.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
OUT = REPO / "docs" / "chrome-web-store" / "screenshots"
# The Chrome Web Store accepts at most five screenshots.
MAX_SLIDES = 5
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")

# Replaces chrome.i18n, chrome.storage and the locale fetch used by popup.js.
# Query parameters: lang, settings (JSON), mode (full | segments | advanced), open (1 = expand Advanced).
STUB = """<script>
const params = new URLSearchParams(location.search);
const MESSAGES = %s;
const lang = params.get("lang") || "en";
const state = { uiLanguage: lang, ...JSON.parse(params.get("settings") || "{}") };
window.chrome = {
  i18n: { getUILanguage: () => lang, getMessage: key => MESSAGES.en[key]?.message || "" },
  runtime: { getURL: path => "locale:" + path },
  storage: {
    sync: { get: (defaults, cb) => setTimeout(() => cb({ ...defaults, ...state })), set: () => {} },
    onChanged: { addListener() {} }
  }
};
const realFetch = window.fetch;
window.fetch = async url => {
  const match = String(url).match(/^locale:_locales\\/(\\w+)\\/messages\\.json$/);
  return match ? new Response(JSON.stringify(MESSAGES[match[1]])) : realFetch(url);
};
document.documentElement.dataset.mode = params.get("mode") || "full";
</script>
<style>
  * { transition: none !important; }
  html[data-mode="advanced"] .header,
  html[data-mode="advanced"] section.card:not(:last-of-type),
  html[data-mode="segments"] .header,
  html[data-mode="segments"] section.card:not(:nth-of-type(2)) { display: none; }
  html:not([data-mode="full"]) .popup { padding: 0; }
  html:not([data-mode="full"]) .card { margin-bottom: 0; }
  html:not([data-mode="full"]) body { background: #0c0f15; }
</style>
"""

# Reports the rendered popup height so slide.html can scale it into place.
REPORT_HEIGHT = """<script>
setTimeout(() => {
  if (params.get("open") === "1") document.getElementById("advancedToggle").click();
  setTimeout(() => {
    const h = Math.ceil(document.querySelector(".popup").getBoundingClientRect().height);
    parent.postMessage({ popupHeight: h }, "*");
  }, 50);
}, 100);
</script>
"""


def build_page(work: Path) -> None:
    for name in ["popup.css", "popup.js"]:
        shutil.copy(REPO / name, work / name)
    shutil.copytree(REPO / "icons", work / "icons")
    shutil.copy(HERE / "slide.html", work / "slide.html")

    messages = {p.parent.name: json.loads(p.read_text(encoding="utf-8"))
                for p in (REPO / "_locales").glob("*/messages.json")}
    html = (REPO / "popup.html").read_text(encoding="utf-8")
    css_link = '<link rel="stylesheet" href="popup.css" />'
    script = '<script src="popup.js"></script>'
    if html.count(css_link) != 1 or html.count(script) != 1:
        sys.exit("popup.html no longer matches the expected stylesheet/script tags")
    html = html.replace(css_link, css_link + "\n" + STUB % json.dumps(messages, ensure_ascii=False))
    html = html.replace(script, script + "\n" + REPORT_HEIGHT)
    (work / "popup_render.html").write_text(html, encoding="utf-8")


def chrome(work: Path, *args: str) -> str:
    cmd = [CHROME, "--headless=new", "--disable-gpu", f"--user-data-dir={work / 'profile'}",
           "--allow-file-access-from-files", "--hide-scrollbars", "--force-device-scale-factor=1",
           "--window-size=1280,800", "--virtual-time-budget=4000", *args]
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def slide_count() -> int:
    return len(re.findall(r"^\s*\{ eyebrow:", (HERE / "slide.html").read_text(encoding="utf-8"), re.M))


def main() -> None:
    if not Path(CHROME).exists():
        sys.exit(f"Chrome not found at {CHROME}; set CHROME to its binary")
    count = slide_count()
    if count > MAX_SLIDES:
        sys.exit(f"slide.html defines {count} slides; the store accepts at most {MAX_SLIDES}")
    numbers = [int(n) for n in sys.argv[1:]] or list(range(1, count + 1))
    if any(not 1 <= n <= count for n in numbers):
        sys.exit(f"slide numbers must be between 1 and {count}")
    OUT.mkdir(parents=True, exist_ok=True)
    # Drop screenshots of slides that no longer exist so they are not uploaded by mistake.
    for old in OUT.glob("slide-*.png"):
        if int(old.stem.split("-")[1]) > count:
            old.unlink()
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        build_page(work)
        for n in numbers:
            url = (work / "slide.html").as_uri() + f"?n={n}"
            title = re.search(r"<title>([^<]*)", chrome(work, "--dump-dom", url))
            if not title or not title.group(1).startswith("ready"):
                sys.exit(f"slide {n}: popup did not finish rendering")
            target = OUT / f"slide-{n:02d}.png"
            chrome(work, f"--screenshot={target}", url)
            print(f"{target.relative_to(REPO)}  ({title.group(1)})")


if __name__ == "__main__":
    main()
