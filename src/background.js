/**
 * Background service worker — receives captures from content scripts
 * and POSTs them to the tilth ingest gateway.
 */

const DEFAULTS = {
  gatewayUrl: "http://localhost:8001",
  identity: "browser-capture",
  namespace: "web",
};

let settings = { ...DEFAULTS };

// Load settings on startup
chrome.storage.sync.get("tilthCapture", (stored) => {
  settings = { ...DEFAULTS, ...(stored.tilthCapture || {}) };
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.tilthCapture) {
    settings = { ...DEFAULTS, ...(changes.tilthCapture.newValue || {}) };
  }
});

// Context menu — right-click "Save to Tilth"
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "tilth-capture-selection",
    title: "Save selection to Tilth",
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "tilth-capture-page",
    title: "Save page to Tilth",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === "tilth-capture-selection") {
    chrome.tabs.sendMessage(tab.id, { type: "capture-selection" });
  } else if (info.menuItemId === "tilth-capture-page") {
    chrome.tabs.sendMessage(tab.id, { type: "capture-page" });
  }
});

// Receive captures from content scripts
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== "capture") return;

  const { text, url, title, domain, trigger, timestamp } = msg.payload;

  // Build the text with context
  const fullText = [
    `Source: ${url}`,
    `Title: ${title}`,
    `Captured: ${new Date(timestamp).toISOString()} (${trigger})`,
    "",
    text,
  ].join("\n");

  // POST to tilth ingest gateway
  sendToTilth(fullText, domain, trigger).catch((err) => {
    console.warn("[tilth-capture] Failed to send:", err.message);
  });
});

/**
 * Send content to the tilth ingest gateway.
 */
async function sendToTilth(text, domain, trigger) {
  const body = {
    text: text,
    namespace: settings.namespace,
    metadata: {
      env: "prod",
      subject_id: domain,
    },
  };

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "tilth-capture/0.1.0",
  };

  if (settings.identity) {
    headers["x-workload-identity"] = settings.identity;
  }

  const resp = await fetch(`${settings.gatewayUrl}/ingest`, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`Gateway returned ${resp.status}`);
  }

  // Update badge to show capture count
  const stored = await chrome.storage.local.get("captureCount");
  const count = (stored.captureCount || 0) + 1;
  await chrome.storage.local.set({ captureCount: count });
  chrome.action.setBadgeText({ text: String(count) });
  chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
}
