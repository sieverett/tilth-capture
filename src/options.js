/**
 * Options page script — load/save settings.
 */

const DEFAULTS = {
  gatewayUrl: "http://localhost:8001",
  identity: "browser-capture",
  namespace: "web",
  dwellThresholdMs: 20000,
  enabled: true,
  allowedDomains: [],
};

async function loadSettings() {
  const stored = await chrome.storage.sync.get("tilthCapture");
  const settings = { ...DEFAULTS, ...(stored.tilthCapture || {}) };

  document.getElementById("gatewayUrl").value = settings.gatewayUrl;
  document.getElementById("identity").value = settings.identity;
  document.getElementById("namespace").value = settings.namespace;
  document.getElementById("dwellThreshold").value =
    settings.dwellThresholdMs / 1000;
  document.getElementById("enabled").checked = settings.enabled;
  document.getElementById("allowedDomains").value =
    settings.allowedDomains.join("\n");
}

async function saveSettings() {
  const domains = document
    .getElementById("allowedDomains")
    .value.split("\n")
    .map((d) => d.trim())
    .filter((d) => d.length > 0);

  const settings = {
    gatewayUrl: document.getElementById("gatewayUrl").value.trim(),
    identity: document.getElementById("identity").value.trim(),
    namespace: document.getElementById("namespace").value.trim(),
    dwellThresholdMs:
      parseInt(document.getElementById("dwellThreshold").value, 10) * 1000,
    enabled: document.getElementById("enabled").checked,
    allowedDomains: domains,
  };

  await chrome.storage.sync.set({ tilthCapture: settings });

  const msg = document.getElementById("savedMsg");
  msg.style.display = "inline";
  setTimeout(() => {
    msg.style.display = "none";
  }, 2000);
}

document.getElementById("saveBtn").addEventListener("click", saveSettings);
loadSettings();
