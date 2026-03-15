(() => {
  const DEFAULT_SETTINGS = {
    enabled: true,
    skipRecaps: true,
    skipIntros: true,
    skipOutros: true,
    skipPreviews: true,
    previewSeekSeconds: 90,
    debug: true
  };

  let settings = { ...DEFAULT_SETTINGS };
  let lastActionAt = 0;
  let lastActionKey = "";
  let observer = null;
  let poller = null;

  function log(...args) {
    if (settings.debug) {
      console.log("[CR Auto Skip]", ...args);
    }
  }

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
        settings = { ...DEFAULT_SETTINGS, ...stored };
        resolve();
      });
    });
  }

  function normalize(text) {
    return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      style.pointerEvents !== "none"
    );
  }

  function getText(el) {
    return normalize([
      el.textContent,
      el.innerText,
      el.getAttribute?.("aria-label"),
      el.getAttribute?.("title"),
      el.getAttribute?.("data-testid"),
      el.getAttribute?.("data-t"),
      el.getAttribute?.("aria-description")
    ].filter(Boolean).join(" "));
  }

  function classify(text) {
    const t = normalize(text);

    if (settings.skipRecaps && (t.includes("recap") || t.includes("previously on"))) {
      return "recap";
    }
    if (settings.skipIntros && (t.includes("skip intro") || t.includes("intro") || t.includes("opening"))) {
      return "intro";
    }
    if (settings.skipOutros && (t.includes("skip credits") || t.includes("credits") || t.includes("ending") || t.includes("outro"))) {
      return "outro";
    }
    if (settings.skipPreviews && (t.includes("preview") || t.includes("up next") || t.includes("next episode"))) {
      return "preview";
    }

    return null;
  }

  function findRoots(root = document) {
    const roots = [root];
    const all = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (const el of all) {
      if (el.shadowRoot) {
        roots.push(...findRoots(el.shadowRoot));
      }
    }
    return roots;
  }

  function findButtons() {
    const selectors = [
      "button",
      "[role='button']",
      "[class*='skip']",
      "[data-testid*='skip']",
      "[aria-label*='skip' i]",
      "[title*='skip' i]"
    ].join(",");

    const roots = findRoots(document);
    const found = [];

    for (const root of roots) {
      let els = [];
      try {
        els = [...root.querySelectorAll(selectors)];
      } catch {
        continue;
      }

      for (const el of els) {
        if (!isVisible(el)) continue;
        const text = getText(el);
        const type = classify(text);
        if (!type) continue;
        found.push({ el, text, type });
      }
    }

    return found;
  }

  function clickSkipButton() {
    if (!settings.enabled) return false;

    const now = Date.now();

    for (const { el, text, type } of findButtons()) {
      const rect = el.getBoundingClientRect();
      const key = `${type}:${Math.round(rect.x)}:${Math.round(rect.y)}:${text}`;

      if (key === lastActionKey && now - lastActionAt < 2500) {
        continue;
      }

      el.click();
      lastActionKey = key;
      lastActionAt = now;
      log("clicked", { type, text, href: location.href, top: window === window.top });
      return true;
    }

    return false;
  }

  function getMainVideo() {
    const videos = [...document.querySelectorAll("video")];
    if (!videos.length) return null;

    videos.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.width * br.height) - (ar.width * ar.height);
    });

    return videos[0];
  }

  function collectOverlayText() {
    const roots = findRoots(document);
    let text = "";

    for (const root of roots) {
      let nodes = [];
      try {
        nodes = [...root.querySelectorAll("button, div, span, p")];
      } catch {
        continue;
      }

      for (const el of nodes.slice(0, 500)) {
        if (!isVisible(el)) continue;
        text += " " + getText(el);
      }
    }

    return normalize(text);
  }

  function seekFallback() {
    if (!settings.enabled) return false;

    const video = getMainVideo();
    if (!video || !isFinite(video.duration) || video.duration <= 0) return false;

    const now = Date.now();
    if (now - lastActionAt < 2500) return false;

    const remaining = video.duration - video.currentTime;
    const overlayText = collectOverlayText();

    if (
      settings.skipPreviews &&
      remaining < Math.max(120, settings.previewSeekSeconds + 10) &&
      (overlayText.includes("preview") || overlayText.includes("up next") || overlayText.includes("next episode"))
    ) {
      const from = video.currentTime;
      video.currentTime = Math.min(video.duration - 1, video.currentTime + Number(settings.previewSeekSeconds || 90));
      lastActionKey = `preview-seek:${Math.floor(from)}`;
      lastActionAt = now;
      log("seek preview", { from, to: video.currentTime, href: location.href });
      return true;
    }

    return false;
  }

  function tick() {
    try {
      if (clickSkipButton()) return;
      seekFallback();
    } catch (err) {
      log("tick error", err);
    }
  }

  function start() {
    log("started", {
      href: location.href,
      top: window === window.top,
      hasVideo: !!document.querySelector("video")
    });

    observer?.disconnect();
    if (poller) clearInterval(poller);

    observer = new MutationObserver(() => tick());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true
    });

    poller = setInterval(tick, 700);
    tick();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, val] of Object.entries(changes)) {
      settings[key] = val.newValue;
    }
    log("settings updated", settings);
  });

  loadSettings().then(start);
})();