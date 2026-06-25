(() => {
  const DEFAULT_SETTINGS = {
    enabled: true,
    skipRecaps: true,
    skipIntros: true,
    skipOutros: true,
    skipPreviews: true,
    skipDelay: 3
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

    const aria_text_recap = ["recap", "zusammenfassung", "résumé", "resumen"]
    const aria_text_intro = ["intro", "opening"];
    const aria_text_outro = ["outro", "ending", "credits", "générique", "créditos"];
    const aria_text_preview = ["preview", "vorschau", "avance", "aperçu"]

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

  function clickSpecificSkipButton(el, text, type, key) {
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
    return true;
  }

  function runSkipCheck() {
    if (!settings.enabled) return false;

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

    pendingSkipTimer = setTimeout(() => {
      pendingSkipTimer = null;

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
  }

  function start() {
    if (!location.href.includes("watch")) {
      log("start skipped, URL does not include watch", { href: location.href });
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
      if ((e.key === "s" || e.key === "S") && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const target = e.target;
        // Don't intercept if the user is typing in an input field
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.contentEditable === "true") {
          return;
        }
        e.preventDefault();
        
        const buttons = findButtons();
        if (buttons.length > 0) {
          const { type } = buttons[0];
          ignoreCurrentSkipType = type;
          currentActiveSkipType = type;
          log("keyboard shortcut: skip ignored until type changes", { ignoredType: type });
        }
      }
    });
  }

  installLocationChangeHooks();
  installKeyboardShortcuts();
  startUrlWatcher();
  loadSettings().then(start);
})();