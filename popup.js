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

const TOGGLE_IDS = [
  "enabled",
  "skipRecaps",
  "skipIntros",
  "skipOutros",
  "skipPreviews",
  "previewSeekFallback",
  "debugLogging"
];

function getEl(id) {
  return document.getElementById(id);
}

function sanitizeSeekValue(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS.previewSeekSeconds;
  return Math.min(180, Math.max(15, Math.round(parsed)));
}

function applyDisabledState() {
  const master = getEl("enabled").checked;

  for (const id of TOGGLE_IDS) {
    if (id === "enabled") continue;
    getEl(id).disabled = !master;
  }

  getEl("previewSeekSeconds").disabled = !master || !getEl("previewSeekFallback").checked;
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

  const seekInput = getEl("previewSeekSeconds");

  const commitSeekInput = () => {
    const value = sanitizeSeekValue(seekInput.value);
    seekInput.value = String(value);
    savePartial({ previewSeekSeconds: value });
  };

  seekInput.addEventListener("change", commitSeekInput);
  seekInput.addEventListener("blur", commitSeekInput);
}

function init() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    for (const id of TOGGLE_IDS) {
      getEl(id).checked = Boolean(settings[id]);
    }

    getEl("previewSeekSeconds").value = String(sanitizeSeekValue(settings.previewSeekSeconds));

    bindToggles();
    applyDisabledState();
  });
}

document.addEventListener("DOMContentLoaded", init);
