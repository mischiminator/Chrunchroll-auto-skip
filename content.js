(() => {
  const DEFAULT_SETTINGS = {
    enabled: true,
    skipRecaps: true,
    skipIntros: true,
    skipOutros: true,
    skipPreviews: true,
    skipDelay: 3,
    disableSkipHotkey: "d"
  };

  let settings = { ...DEFAULT_SETTINGS };
  let lastActionAt = 0;
  let lastActionKey = "";
  let observer = null;
  let poller = null;
  let ignoreCurrentSkipType = null;
  let currentActiveSkipType = null;

  function log(...args) {
    console.log("[CR Auto Skip]", ...args);
  }

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
        settings = { ...DEFAULT_SETTINGS, ...stored };
        resolve();
      });
    });
  }

  // Listen for settings changes and update in real-time
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in DEFAULT_SETTINGS) {
        settings[key] = newValue ?? DEFAULT_SETTINGS[key];
        if (key === "enabled" || key.startsWith("skip")) clearPendingSkipTimer();
        log("setting updated", { key, value: settings[key] });
      }
    }
    if (!settings.enabled) clearPendingSkipTimer();
  });

  function normalize(text) {
    return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.matches(":disabled") || el.closest('[aria-disabled="true"], [inert]')) return false;
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

  function safeClick(el) {
    try {
      el.click();
      return true;
    } catch (err) {
      return false;
    }
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

  function containsAny(textToTest, testList) {
    return testList.some(element => textToTest.includes(element));
  }

  function classify(text) {
    const t = normalize(text);

    const aria_text_recap = ["recap", "zusammenfassung", "résumé", "resumen", "recapitulação"]
    const aria_text_intro = ["intro", "opening", "introdução"];
    const aria_text_outro = ["outro", "ending", "credits", "générique", "créditos"];
    const aria_text_preview = ["preview", "vorschau", "avance", "aperçu", "prévia"]

    if (settings.skipRecaps && containsAny(t, aria_text_recap)) {
      return "recap";
    }
    if (settings.skipIntros && containsAny(t, aria_text_intro)) {
      return "intro";
    }
    if (settings.skipOutros && containsAny(t, aria_text_outro)) {
      return "outro";
    }
    if (settings.skipPreviews && containsAny(t, aria_text_preview)) {
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

  function hasSkipIntent(el) {
    // Segment words alone (e.g. "Open preview details") are not skip actions.
    const identifiers = ["data-testid", "data-t", "class"].map(name =>
      (el.getAttribute(name) || "").replace(/([a-z])([A-Z])/g, "$1 $2")).join(" ");
    const text = normalize(`${getText(el)} ${identifiers}`).replace(/[_-]+/g, " ");
    return /(?:^|[^\p{L}\p{N}])(?:skip|überspringen|überspring|omitir|saltar|passer|ignorer|pular)(?=$|[^\p{L}\p{N}])/u.test(text);
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
        if (!isVisible(el) || !hasSkipIntent(el)) continue;
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

      if (!safeClick(el)) {
        log("failed to click", { text, href: location.href, top: window === window.top });
        continue;
      }

      lastActionKey = key;
      lastActionAt = now;
      log("clicked", { type, text, href: location.href, top: window === window.top });
      return true;
    }

    return false;
  }

  function getMainVideo() {
    const videos = findRoots(document).flatMap(root => [...root.querySelectorAll("video")]);
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


  let pendingSkipTimer = null;
  let pendingSkipKey = "";

  function getSkipDelayMs() {
    const delaySec = Number(settings.skipDelay ?? DEFAULT_SETTINGS.skipDelay);
    return Math.max(0, Math.min(10, delaySec)) * 1000;
  }

  function getButtonKey(el, text, type) {
    const rect = el.getBoundingClientRect();
    return `${type}:${Math.round(rect.x)}:${Math.round(rect.y)}:${text}`;
  }

  function shouldDelayType(type) {
    return type === "intro" || type === "outro";
  }

  function clearPendingSkipTimer() {
    if (pendingSkipTimer !== null) {
      clearTimeout(pendingSkipTimer);
      pendingSkipTimer = null;
    }
    pendingSkipKey = "";
  }

  async function playWithRetry(media, delay = 100, maxRetries = 5) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            await media.play();
            return; // Playback started successfully
        } catch (error) {
            if (attempt === maxRetries) {
                console.error("Playback failed after all retries:", error);
                throw error;
            }

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

  function clickSpecificSkipButton(el, text, type, key) {
    if (!settings.enabled || ignoreCurrentSkipType === type || !el.isConnected ||
        !isVisible(el) || !hasSkipIntent(el) || classify(getText(el)) !== type) return false;

    // An outro click can expose the preview control before the native seek ends.
    // Do not issue a second skip while that first player transition is in flight.
    let video = getMainVideo();
    if (video?.seeking) return false;

    const now = Date.now();

    if (key === lastActionKey && now - lastActionAt < 2500) {
      return false;
    }

    if (!safeClick(el)) {
      log("failed to click", { type, text, href: location.href, top: window === window.top });
      return false;
    }

    lastActionKey = key;
    lastActionAt = now;
    log("clicked", { type, text, href: location.href, top: window === window.top });

    /*
     * FIX: Sometimes the player gets stuck after skipping the outro.
     * The player needs to be forced to play again to transition to the next episode.
     */
    if (type === "outro") {
      resumeAfterSeek().catch(err => log("resume after outro skip failed", err));
    }

    return true;
  }

  // Never busy-wait on `seeking`: the seek only completes once the event loop
  // runs, so a synchronous loop freezes the frame forever.
  function waitForSeekEnd(video, timeoutMs = 5000) {
    if (!video?.seeking) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        video.removeEventListener("seeked", done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      video.addEventListener("seeked", done, { once: true });
    });
  }

  async function resumeAfterSeek() {
    await waitForSeekEnd(getMainVideo());
    // The player may have swapped its <video> element during the transition.
    const video = getMainVideo();
    if (video?.paused && !video.ended) {
      await playWithRetry(video);
    }
  }

  function runSkipCheck() {
    if (!settings.enabled) {
      clearPendingSkipTimer();
      return false;
    }

    const buttons = findButtons();

    if (!buttons.length) {
      clearPendingSkipTimer();
      currentActiveSkipType = null;
      ignoreCurrentSkipType = null;
      return false;
    }

    const { el, text, type } = buttons[0];
    const key = getButtonKey(el, text, type);

    // If the skip type changed, reset the ignore flag
    if (currentActiveSkipType !== type) {
      currentActiveSkipType = type;
      if (ignoreCurrentSkipType !== type) {
        // Type changed from what we were ignoring, allow skipping again
        ignoreCurrentSkipType = null;
      } else {
        // Different type now, but it matches what we want to ignore, keep ignoring
      }
    }

    // Skip this type if it's currently ignored
    if (ignoreCurrentSkipType === type) {
      log("skipping manual skip for ignored type", { type, text });
      return false;
    }

    if (!shouldDelayType(type)) {
      clearPendingSkipTimer();
      return clickSpecificSkipButton(el, text, type, key);
    }

    const delayMs = getSkipDelayMs();

    if (delayMs <= 0) {
      clearPendingSkipTimer();
      return clickSpecificSkipButton(el, text, type, key);
    }

    if (pendingSkipTimer !== null && pendingSkipKey === key) {
      return false;
    }

    clearPendingSkipTimer();
    pendingSkipKey = key;
    const scheduledUrl = location.href;

    pendingSkipTimer = setTimeout(() => {
      pendingSkipTimer = null;
      if (!settings.enabled || ignoreCurrentSkipType === type || location.href !== scheduledUrl) {
        pendingSkipKey = "";
        return;
      }

      const stillVisible = findButtons().find(({ el: currentEl, text: currentText, type: currentType }) => {
        return getButtonKey(currentEl, currentText, currentType) === key;
      });

      if (!stillVisible) {
        pendingSkipKey = "";
        return;
      }

      clickSpecificSkipButton(stillVisible.el, stillVisible.text, stillVisible.type, key);
      pendingSkipKey = "";
    }, delayMs);

    log("scheduled delayed skip", { type, delayMs, text, href: location.href });
    return false;
  }

  function forceTick() {
    // called by observer and interval
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      start();
      return;
    }

    try {
      runSkipCheck();
    } catch (err) {
      log("skip error", err);
    }
  }

  function stop() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (poller) {
      clearInterval(poller);
      poller = null;
    }

    clearPendingSkipTimer();
    ignoreCurrentSkipType = null;
    currentActiveSkipType = null;
    lastActionKey = "";
    lastActionAt = 0;
  }

  function isWatchUrl(url) {
    try {
      const parsed = new URL(url);
      return ["www.crunchyroll.com", "crunchyroll.com"].includes(parsed.hostname) &&
        /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?watch(?:\/|$)/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function isPlaybackContext() {
    if (isWatchUrl(location.href)) return true;
    if (window === window.top) return false;

    // Embedded static players need not have a /watch route of their own.
    if (location.origin === "https://static.crunchyroll.com") return true;
    if (location.protocol !== "about:" && location.protocol !== "blob:") return false;
    if (isWatchUrl(document.referrer)) return true;
    try {
      return isWatchUrl(window.top.location.href);
    } catch {
      // A cross-origin parent cannot be inspected; do not bypass that boundary.
      return false;
    }
  }

  function start() {
    if (!isPlaybackContext()) {
      log("start skipped outside a playback context", { href: location.href });
      stop();
      return;
    }

    log("started", { href: location.href });
    stop();

    observer = new MutationObserver(forceTick);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true
    });

    poller = setInterval(forceTick, 700);
    forceTick();
  }

  function hookUrlChange(newUrl) {
    // called on SPA navigation (history API / hashchange)
    if (newUrl !== currentUrl) {
      currentUrl = newUrl;
      start();
    }
  }

  let currentUrl = location.href;
  let urlWatcherInterval = null;

  function startUrlWatcher() {
    if (urlWatcherInterval !== null) return;

    urlWatcherInterval = setInterval(() => {
      if (location.href !== currentUrl) {
        currentUrl = location.href;
        start();
      }
    }, 300);
  }

  function installLocationChangeHooks() {
    const origPushState = window.history.pushState;
    const origReplaceState = window.history.replaceState;

    window.history.pushState = function (state, title, url) {
      const result = origPushState.apply(this, arguments);
      hookUrlChange(window.location.href);
      return result;
    };

    window.history.replaceState = function (state, title, url) {
      const result = origReplaceState.apply(this, arguments);
      hookUrlChange(window.location.href);
      return result;
    };

    window.addEventListener("popstate", () => hookUrlChange(window.location.href));
    window.addEventListener("hashchange", () => hookUrlChange(window.location.href));
  }

  function installKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
      if (!settings.enabled) return;
      const hotkey = (settings.disableSkipHotkey || "d").toLowerCase();
      if ((e.key === hotkey || e.key === hotkey.toUpperCase()) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Check inherited editability and original targets inside shadow roots.
        if (e.composedPath().some(target => target instanceof Element &&
            (target.isContentEditable || target.matches("input, textarea, select")))) {
          return;
        }
        const buttons = findButtons();
        if (buttons.length > 0) {
          e.preventDefault();
          const { type } = buttons[0];
          ignoreCurrentSkipType = type;
          currentActiveSkipType = type;
          // Clear any pending skip timer to prevent scheduled skips
          clearPendingSkipTimer();
          log("keyboard shortcut: auto-skip disabled for type", { disabledType: type, hotkey });
        }
      }
    });
  }

  installLocationChangeHooks();
  installKeyboardShortcuts();
  startUrlWatcher();
  loadSettings().then(start);
})();