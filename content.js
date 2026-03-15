(() => {
  const DEFAULT_SETTINGS = {
    enabled: true,
    skipRecaps: true,
    skipIntros: true,
    skipOutros: true,
    skipPreviews: true,
    previewSeekFallback: true,
    debugLogging: false,
    previewSeekSeconds: 90
  };

  const CLICK_DEBOUNCE_MS = 3500;
  const SPA_CHECK_INTERVAL_MS = 500;
  const SCAN_INTERVAL_MS = 1000;
  const SEEK_COOLDOWN_MS = 15000;
  const MAX_SAFE_SEEK_SECONDS = 180;
  const MIN_PREVIEW_ELAPSED_SECONDS = 0;

  let settings = { ...DEFAULT_SETTINGS };
  let lastClickedKey = "";
  let lastClickedAt = 0;
  let lastSeekAt = 0;
  let currentUrl = location.href;
  let observer = null;
  let scanInterval = null;
  let urlWatcher = null;

  function log(...args) {
    if (settings.debugLogging) {
      console.debug("[Crunchyroll Auto Skip Plus]", ...args);
    }
  }

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
        settings = { ...DEFAULT_SETTINGS, ...stored };
        sanitizeSettings();
        resolve(settings);
      });
    });
  }

  function sanitizeSettings() {
    const parsed = Number(settings.previewSeekSeconds);
    if (!Number.isFinite(parsed)) {
      settings.previewSeekSeconds = DEFAULT_SETTINGS.previewSeekSeconds;
      return;
    }

    settings.previewSeekSeconds = Math.min(
      MAX_SAFE_SEEK_SECONDS,
      Math.max(15, Math.round(parsed))
    );
  }

  function normalize(text) {
    return (text || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function isVisible(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const style = getComputedStyle(el);
    if (style.display === "none") return false;
    if (style.visibility === "hidden") return false;
    if (style.pointerEvents === "none") return false;
    if (Number(style.opacity) === 0) return false;

    return true;
  }

  function getElementText(el) {
    const textBits = [
      el.textContent,
      el.innerText,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      el.getAttribute("data-testid"),
      el.getAttribute("data-t"),
      el.getAttribute("data-label")
    ].filter(Boolean);

    return normalize(textBits.join(" "));
  }

  function getCandidates() {
    const selectors = [
      "button",
      "[role='button']",
      "[class*='skip']",
      "[data-testid*='skip']",
      "[aria-label*='skip' i]",
      "[title*='skip' i]"
    ];

    return Array.from(document.querySelectorAll(selectors.join(","))).filter(isVisible);
  }

  function categorizeLabel(text) {
    const hasSkip = text.includes("skip");

    const recap =
      text.includes("recap") ||
      text.includes("previously on") ||
      text.includes("episode recap");

    const intro =
      text.includes("intro") ||
      text.includes("opening") ||
      text.includes("theme song") ||
      text.includes("op ");

    const outro =
      text.includes("outro") ||
      text.includes("ending") ||
      text.includes("credits") ||
      text.includes("ed ");

    const preview =
      text.includes("preview") ||
      text.includes("next episode") ||
      text.includes("up next");

    if (settings.skipRecaps && (recap || (hasSkip && text.includes("recap")))) {
      return "recap";
    }

    if (settings.skipIntros && (intro || (hasSkip && (text.includes("intro") || text.includes("opening"))))) {
      return "intro";
    }

    if (settings.skipOutros && (outro || (hasSkip && (text.includes("credits") || text.includes("ending") || text.includes("outro"))))) {
      return "outro";
    }

    if (settings.skipPreviews && (preview || (hasSkip && text.includes("preview")))) {
      return "preview";
    }

    return null;
  }

  function buildClickKey(el, text) {
    const rect = el.getBoundingClientRect();
    return `${text}|${Math.round(rect.x)}|${Math.round(rect.y)}|${Math.round(rect.width)}|${Math.round(rect.height)}`;
  }

  function clickSkipButton() {
    if (!settings.enabled) return false;

    const candidates = getCandidates();
    for (const el of candidates) {
      const text = getElementText(el);
      if (!text) continue;

      const category = categorizeLabel(text);
      if (!category) continue;

      const key = buildClickKey(el, text);
      const now = Date.now();
      if (key === lastClickedKey && now - lastClickedAt < CLICK_DEBOUNCE_MS) {
        continue;
      }

      el.click();
      lastClickedKey = key;
      lastClickedAt = now;
      log(`Clicked ${category} button:`, text);
      return true;
    }

    return false;
  }

  function getVideo() {
    return document.querySelector("video");
  }

  function playerLooksLikePreview(video) {
    if (!video) return false;
    if (video.paused) return false;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return false;

    const remaining = video.duration - video.currentTime;
    const bodyText = normalize(document.body?.innerText || "");

    const previewHints = [
      "preview",
      "next episode",
      "up next",
      "next time",
      "coming up"
    ];

    const bodyHasPreviewHint = previewHints.some((hint) => bodyText.includes(hint));
    const nearEnd = remaining <= Math.max(120, settings.previewSeekSeconds + 15);
    const reasonablyIntoEpisode = video.currentTime >= MIN_PREVIEW_ELAPSED_SECONDS;

    return settings.skipPreviews && bodyHasPreviewHint && nearEnd && reasonablyIntoEpisode;
  }

  function tryPreviewSeekFallback() {
    if (!settings.enabled || !settings.skipPreviews || !settings.previewSeekFallback) {
      return false;
    }

    const video = getVideo();
    if (!video) return false;

    const now = Date.now();
    if (now - lastSeekAt < SEEK_COOLDOWN_MS) {
      return false;
    }

    if (!playerLooksLikePreview(video)) {
      return false;
    }

    const before = video.currentTime;
    const target = Math.min(video.duration - 1, video.currentTime + settings.previewSeekSeconds);

    if (!Number.isFinite(target) || target <= before + 3) {
      return false;
    }

    video.currentTime = target;
    lastSeekAt = now;
    log(`Preview seek fallback used: ${Math.round(before)}s -> ${Math.round(target)}s`);
    return true;
  }

  function scan() {
    const clicked = clickSkipButton();
    if (!clicked) {
      tryPreviewSeekFallback();
    }
  }

  function resetTransientState() {
    lastClickedKey = "";
    lastClickedAt = 0;
    lastSeekAt = 0;
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "sync") return;

    for (const [key, value] of Object.entries(changes)) {
      settings[key] = value.newValue;
    }
    sanitizeSettings();
    log("Settings updated", settings);
  }

  function startObservers() {
    if (observer) observer.disconnect();
    if (scanInterval) clearInterval(scanInterval);
    if (urlWatcher) clearInterval(urlWatcher);

    observer = new MutationObserver(() => {
      scan();
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: false
    });

    scanInterval = setInterval(scan, SCAN_INTERVAL_MS);

    urlWatcher = setInterval(() => {
      if (location.href !== currentUrl) {
        currentUrl = location.href;
        resetTransientState();
        log("Detected navigation", currentUrl);
        setTimeout(scan, 800);
      }
    }, SPA_CHECK_INTERVAL_MS);
  }

  async function init() {
    await loadSettings();
    chrome.storage.onChanged.addListener(handleStorageChange);
    startObservers();
    scan();
    log("Initialized", settings);
  }

  init();
})();
