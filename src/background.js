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

// Receive messages from popup and content scripts
chrome.runtime.onMessage.addListener((msg, sender) => {
  // Handle "Capture this page now" from popup
  if (msg.type === "capture-page-request") {
    capturePageDirectly(msg.tabId, msg.url, msg.title);
    return;
  }

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

  // Track stats per page
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
  trackCapture(url, title, domain, wordCount, trigger);

  // POST to tilth ingest gateway
  sendToTilth(fullText, domain, trigger).catch((err) => {
    console.warn("[tilth-capture] Failed to send:", err.message);
  });
});

/**
 * Track capture stats per page for the current session.
 */
async function trackCapture(url, title, domain, wordCount, trigger) {
  const stored = await chrome.storage.session.get("captureStats");
  const stats = stored.captureStats || {
    pages: {},
    totalWords: 0,
    totalCaptures: 0,
    sessionStart: Date.now(),
  };

  const pageKey = url;
  if (!stats.pages[pageKey]) {
    stats.pages[pageKey] = {
      title: title,
      domain: domain,
      url: url,
      words: 0,
      captures: 0,
      triggers: {},
    };
  }

  const page = stats.pages[pageKey];
  page.words += wordCount;
  page.captures += 1;
  page.triggers[trigger] = (page.triggers[trigger] || 0) + 1;

  stats.totalWords += wordCount;
  stats.totalCaptures += 1;

  await chrome.storage.session.set({ captureStats: stats });
}

/**
 * Capture page content directly using chrome.scripting.executeScript.
 * Works even when content script isn't injected.
 */
async function capturePageDirectly(tabId, url, title) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        const main =
          document.querySelector("article") ||
          document.querySelector("[role='main']") ||
          document.querySelector("main") ||
          document.body;
        return (main.innerText || "").trim();
      },
    });

    const text = results && results[0] && results[0].result;
    if (!text || text.length < 10) {
      console.warn("[tilth-capture] No content found on page");
      return;
    }

    let domain = "";
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = "unknown";
    }

    const fullText = [
      `Source: ${url}`,
      `Title: ${title}`,
      `Captured: ${new Date().toISOString()} (page)`,
      "",
      text,
    ].join("\n");

    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
    trackCapture(url, title, domain, wordCount, "page");

    await sendToTilth(fullText, domain, "page");
  } catch (err) {
    console.warn("[tilth-capture] Failed to capture page:", err.message);
  }
}

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

  // Update badge from session stats
  const sessionStored = await chrome.storage.session.get("captureStats");
  const stats = sessionStored.captureStats || { totalCaptures: 0 };
  chrome.action.setBadgeText({ text: String(stats.totalCaptures) });
  chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
}
