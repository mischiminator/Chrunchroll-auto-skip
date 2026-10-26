// Language management
let currentLanguage = "en";
let translations = {};
let currentHotkey = "d";

// Map of element IDs to message keys for easy translation
const translationMap = {
  // Title and header
  "extName": { selector: "h1" },
  "extTitle": { selector: ".sub" },
  
  // Master switch section
  "masterSwitch": { selector: "label[for='enabled'] .label" },
  "masterSwitchHelp": { selector: "label[for='enabled'] .help" },
  
  // Segment controls section
  "segmentControls": { selector: "#segmentControls" },
  "recaps": { selector: "label[for='skipRecaps'] .label" },
  "recapsHelp": { selector: "label[for='skipRecaps'] .help" },
  "intros": { selector: "label[for='skipIntros'] .label" },
  "introsHelp": { selector: "label[for='skipIntros'] .help" },
  "outros": { selector: "label[for='skipOutros'] .label" },
  "outrosHelp": { selector: "label[for='skipOutros'] .help" },
  "previews": { selector: "label[for='skipPreviews'] .label" },
  "previewsHelp": { selector: "label[for='skipPreviews'] .help" },
  "endSlate": { selector: "label[for='closeEndSlate'] .label" },
  "endSlateHelp": { selector: "label[for='closeEndSlate'] .help" },
  
  // Advanced section
  "advanced": { selector: "#advancedLabel" },
  "seconds": { selector: ".suffix" },
  "language": { selector: "label[for='language'] .label" },
  "languageHelp": { selector: "label[for='language'] .help" },
  "skipDelay": { selector: "label[for='skipDelay'] .label" },
  "skipDelayHelp": { selector: "label[for='skipDelay'] .help" },
  "hotkey": { selector: "label[for='hotkeyInput'] .label" },
  "hotkeyHelp": { selector: "label[for='hotkeyInput'] .help" },
  "keyboardShortcut": { selector: ".info-box .label" },
  "keyboardShortcutHelp": { selector: ".info-box .help" }
};

async function loadLanguage(lang) {
  try {
    const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
    const response = await fetch(url);
    const data = await response.json();
    translations[lang] = data;
    return data;
  } catch (err) {
    console.error(`Failed to load language ${lang}:`, err);
    return null;
  }
}

function getMessage(key) {
  const message = translations[currentLanguage]?.[key]?.message ||
    chrome.i18n.getMessage(key) || `__MSG_${key}__`;
  return message.replaceAll("{hotkey}", currentHotkey.toUpperCase());
}

function updateShortcutHelp(value) {
  currentHotkey = String(value || DEFAULT_SETTINGS.disableSkipHotkey).toLowerCase().charAt(0);
  for (const key of ["keyboardShortcut", "keyboardShortcutHelp"]) {
    document.querySelector(translationMap[key].selector).textContent = getMessage(key);
  }
}

function translatePage() {
  // Translate each element based on the translation map
  for (const [key, config] of Object.entries(translationMap)) {
    const elements = document.querySelectorAll(config.selector);
    elements.forEach(element => {
      element.textContent = getMessage(key);
    });
  }
}

const DEFAULT_SETTINGS = {
  enabled: true,
  skipRecaps: true,
  skipIntros: true,
  skipOutros: true,
  skipPreviews: true,
  closeEndSlate: true,
  skipDelay: 3,
  disableSkipHotkey: "d"
};

const TOGGLE_IDS = [
  "enabled",
  "skipRecaps",
  "skipIntros",
  "skipOutros",
  "skipPreviews",
  "closeEndSlate"
];

function getEl(id) {
  return document.getElementById(id);
}

function sanitizeDelayValue(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS.skipDelay;
  return Math.min(10, Math.max(0, Math.round(parsed)));
}

function applyDisabledState() {
  const master = getEl("enabled").checked;

  for (const id of TOGGLE_IDS) {
    if (id === "enabled") continue;
    getEl(id).disabled = !master;
  }
}

function savePartial(data) {
  chrome.storage.sync.set(data);
}

function bindToggles() {
  for (const id of TOGGLE_IDS) {
    const el = getEl(id);
    el.addEventListener("change", () => {
      savePartial({ [id]: el.checked });
      applyDisabledState();
    });
  }
}

function setupEventListeners() {
  // Setup language dropdown
  const langSelect = getEl("language");
  if (langSelect) {
    langSelect.value = currentLanguage;
    langSelect.addEventListener("change", (e) => {
      currentLanguage = e.target.value;
      chrome.storage.sync.set({ uiLanguage: currentLanguage });
      translatePage();
    });
  }

  // Setup collapsible advanced section
  const advancedToggle = getEl("advancedToggle");
  const advancedContent = getEl("advancedContent");
  
  if (advancedToggle && advancedContent) {
    advancedToggle.addEventListener("click", () => {
      const expanded = !advancedContent.classList.toggle("collapsed");
      advancedToggle.setAttribute("aria-expanded", String(expanded));
      const icon = advancedToggle.querySelector(".toggle-icon");
      icon.textContent = expanded ? "▲" : "▼";
    });
  }

  // Setup toggles and settings
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    for (const id of TOGGLE_IDS) {
      const el = getEl(id);
      if (el) {
        el.checked = Boolean(settings[id]);
      }
    }

    const skipDelayInput = getEl("skipDelay");
    if (skipDelayInput) {
      skipDelayInput.value = String(sanitizeDelayValue(settings.skipDelay ?? DEFAULT_SETTINGS.skipDelay));
      getEl("skipDelayValue").textContent = skipDelayInput.value;
      
      const commitDelayInput = () => {
        const value = sanitizeDelayValue(skipDelayInput.value);
        skipDelayInput.value = String(value);
        savePartial({ skipDelay: value });
        getEl("skipDelayValue").textContent = String(value);
      };
      
      skipDelayInput.addEventListener("change", commitDelayInput);
      skipDelayInput.addEventListener("blur", commitDelayInput);
      skipDelayInput.addEventListener("input", () => {
        const displayValue = skipDelayInput.value;
        getEl("skipDelayValue").textContent = displayValue;
      });
    }

    const hotkeyInput = getEl("hotkeyInput");
    if (hotkeyInput) {
      updateShortcutHelp(settings.disableSkipHotkey);
      hotkeyInput.value = currentHotkey.toUpperCase();
      
      const commitHotkey = () => {
        let value = hotkeyInput.value.toLowerCase().trim();
        if (!value || value.length === 0) {
          value = "d";
        } else {
          value = value.charAt(0); // Take only first character
        }
        hotkeyInput.value = value.toUpperCase();
        savePartial({ disableSkipHotkey: value });
        updateShortcutHelp(value);
      };
      
      hotkeyInput.addEventListener("change", commitHotkey);
      hotkeyInput.addEventListener("blur", commitHotkey);
      hotkeyInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitHotkey();
        }
      });
    }

    bindToggles();
    applyDisabledState();
  });

  // Listen for storage changes to update UI in real-time
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key === "disableSkipHotkey") {
        updateShortcutHelp(newValue);
        getEl("hotkeyInput").value = currentHotkey.toUpperCase();
      }
      if (key === "skipDelay" && newValue !== undefined) {
        const skipDelayInput = getEl("skipDelay");
        if (skipDelayInput) {
          skipDelayInput.value = String(newValue);
          getEl("skipDelayValue").textContent = String(newValue);
        }
      }
    }
  });
}

function init() {
  // Detect browser language
  const browserLang = chrome.i18n.getUILanguage().split("-")[0];
  const supportedLangs = ["en", "de", "es", "fr", "pt_BR"];
  const defaultLang = browserLang === "pt" ? "pt_BR" :
    supportedLangs.includes(browserLang) ? browserLang : "en";

  // Check if user has saved a language preference
  chrome.storage.sync.get({ uiLanguage: defaultLang }, async (stored) => {
    currentLanguage = stored.uiLanguage;
    
    // Load all language files
    for (const lang of supportedLangs) {
      await loadLanguage(lang);
    }
    
    translatePage();
    setupEventListeners();
  });
}

document.addEventListener("DOMContentLoaded", init);