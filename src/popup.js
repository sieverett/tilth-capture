/**
 * Popup script — shows status and controls.
 */

const DEFAULTS = {
  dwellThresholdMs: 20000,
  enabled: true,
  allowedDomains: [],
  pausedUntil: null,
};

async function init() {
  const stored = await chrome.storage.sync.get("tilthCapture");
  const settings = { ...DEFAULTS, ...(stored.tilthCapture || {}) };

  const local = await chrome.storage.local.get("captureCount");
  const count = local.captureCount || 0;

  // Status
  const dot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");

  const isPaused =
    settings.pausedUntil && Date.now() < settings.pausedUntil;

  if (!settings.enabled) {
    dot.className = "dot off";
    statusText.textContent = "Disabled";
  } else if (isPaused) {
    dot.className = "dot paused";
    const remaining = Math.ceil(
      (settings.pausedUntil - Date.now()) / 60000
    );
    statusText.textContent = `Paused (${remaining}m remaining)`;
  } else {
    dot.className = "dot active";
    statusText.textContent = "Active";
  }

  // Stats
  const sessionStored = await chrome.storage.session.get("captureStats");
  const sessionStats = sessionStored.captureStats || { totalWords: 0, totalCaptures: 0 };
  document.getElementById("captureCount").textContent =
    `${sessionStats.totalCaptures} (${sessionStats.totalWords.toLocaleString()} words)`;
  document.getElementById("dwellThreshold").textContent =
    (settings.dwellThresholdMs / 1000) + "s";

  // Current domain
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tab && tab.url) {
    try {
      const url = new URL(tab.url);
      const domain = url.hostname;
      document.getElementById("currentDomain").textContent = domain;

      const isAllowed =
        settings.allowedDomains.length === 0 ||
        settings.allowedDomains.some(
          (d) => domain === d || domain.endsWith("." + d)
        );
      document.getElementById("domainStatus").textContent = isAllowed
        ? "This domain is being captured"
        : "This domain is not in the allowlist";
    } catch {
      document.getElementById("currentDomain").textContent = "—";
    }
  }

  // Toggle button
  const toggleBtn = document.getElementById("toggleBtn");
  if (isPaused) {
    toggleBtn.textContent = "Resume";
    toggleBtn.className = "primary";
  } else if (!settings.enabled) {
    toggleBtn.textContent = "Enable";
    toggleBtn.className = "primary";
  } else {
    toggleBtn.textContent = "Pause (1 hour)";
    toggleBtn.className = "";
  }

  toggleBtn.addEventListener("click", async () => {
    if (!settings.enabled) {
      settings.enabled = true;
      settings.pausedUntil = null;
    } else if (isPaused) {
      settings.pausedUntil = null;
    } else {
      settings.pausedUntil = Date.now() + 3600000; // 1 hour
    }
    await chrome.storage.sync.set({ tilthCapture: settings });
    window.close();
  });

  // Capture button — send to background, not content script
  document.getElementById("captureBtn").addEventListener("click", async () => {
    if (tab && tab.id) {
      chrome.runtime.sendMessage({
        type: "capture-page-request",
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
      });
      window.close();
    }
  });

  // Stats button
  document.getElementById("statsBtn").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/stats.html") });
  });

  // Settings button
  document.getElementById("settingsBtn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

init();
