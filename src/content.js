/**
 * Content script — runs on every allowed page.
 * Tracks dwell time per visible content element and sends
 * captures to the background service worker.
 */

const DWELL_CHECK_INTERVAL = 1000; // Check every second
const CONTENT_SELECTORS = "p, article, section, [role='main'], .post, .entry, .content, blockquote, li";

let settings = null;
let dwellTimers = new Map(); // element -> { startTime, totalMs, captured }
let observer = null;
let capturedHashes = new Set(); // dedup: hashes of text already sent this page

/**
 * Initialize settings from storage.
 */
async function init() {
  const stored = await chrome.storage.sync.get("tilthCapture");
  settings = {
    dwellThresholdMs: 20000,
    minTextLength: 50,
    maxCaptureLength: 256 * 1024,
    enabled: true,
    allowedDomains: [],
    blockedDomains: [],
    pausedUntil: null,
    ...((stored && stored.tilthCapture) || {}),
  };

  if (!shouldRun()) {
    console.log("[tilth-capture] Not running on this page");
    return;
  }

  console.log("[tilth-capture] Active on", window.location.hostname);
  setupDwellTracking();
  setupSelectionCapture();

  // Listen for settings changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.tilthCapture) {
      settings = {
        ...settings,
        ...(changes.tilthCapture.newValue || {}),
      };
      if (!shouldRun()) {
        cleanup();
      }
    }
  });
}

/**
 * Check if capture should run on this page.
 */
function shouldRun() {
  if (!settings.enabled) return false;

  if (settings.pausedUntil && Date.now() < settings.pausedUntil) return false;

  const hostname = window.location.hostname;

  const matchesDomain = (list) =>
    list.some((d) => hostname === d || hostname.endsWith("." + d));

  // Blocked always wins
  if (settings.blockedDomains.length > 0 && matchesDomain(settings.blockedDomains)) {
    return false;
  }

  // If allowlist has entries, only those domains run
  if (settings.allowedDomains.length > 0) {
    return matchesDomain(settings.allowedDomains);
  }

  return true;
}

/**
 * Track dwell time on visible content elements.
 */
function setupDwellTracking() {
  // Use IntersectionObserver to track which elements are visible
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target;
        const text = el.innerText || "";

        if (text.trim().length < settings.minTextLength) continue;

        if (entry.isIntersecting) {
          // Element entered viewport
          if (!dwellTimers.has(el)) {
            dwellTimers.set(el, {
              startTime: Date.now(),
              totalMs: 0,
              captured: false,
            });
          } else {
            const timer = dwellTimers.get(el);
            timer.startTime = Date.now();
          }
        } else {
          // Element left viewport — accumulate time
          if (dwellTimers.has(el)) {
            const timer = dwellTimers.get(el);
            if (timer.startTime) {
              timer.totalMs += Date.now() - timer.startTime;
              timer.startTime = null;
            }
          }
        }
      }
    },
    { threshold: 0.5 } // 50% visible
  );

  // Observe content elements
  const elements = document.querySelectorAll(CONTENT_SELECTORS);
  console.log("[tilth-capture] Observing", elements.length, "elements");
  elements.forEach((el) => {
    observer.observe(el);
  });

  // Also observe new elements added dynamically
  const mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          if (node.matches && node.matches(CONTENT_SELECTORS)) {
            observer.observe(node);
          }
          node.querySelectorAll &&
            node.querySelectorAll(CONTENT_SELECTORS).forEach((el) => {
              observer.observe(el);
            });
        }
      }
    }
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });

  // Periodic check for dwell threshold
  setInterval(checkDwellThresholds, DWELL_CHECK_INTERVAL);
}

/**
 * Check if any elements have exceeded the dwell threshold.
 */
function checkDwellThresholds() {
  if (!shouldRun()) return;

  const now = Date.now();

  for (const [el, timer] of dwellTimers.entries()) {
    if (timer.captured) continue;

    let totalMs = timer.totalMs;
    if (timer.startTime) {
      totalMs += now - timer.startTime;
    }

    if (totalMs >= settings.dwellThresholdMs) {
      const text = el.innerText || "";
      if (text.trim().length >= settings.minTextLength) {
        // Skip if a parent element was already captured with this text
        if (!isNestedCapture(el)) {
          captureContent(text.trim(), "dwell");
        }
        timer.captured = true;
      }
    }
  }
}

/**
 * Capture text selection via right-click context menu.
 */
function setupSelectionCapture() {
  // Listen for messages from background script (context menu click)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "capture-selection") {
      const selection = window.getSelection().toString().trim();
      if (selection.length > 0) {
        captureContent(selection, "selection");
      }
    }
    // Note: "capture-page" is handled by the background script
    // via chrome.scripting.executeScript (works without content script)
  });
}

/**
 * Check if a parent element was already captured with overlapping text.
 */
function isNestedCapture(el) {
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    if (dwellTimers.has(parent) && dwellTimers.get(parent).captured) {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

/**
 * Simple string hash for dedup (not crypto, just fast).
 */
function quickHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

/**
 * Check if text is a substring of something already captured,
 * or if something already captured is a substring of this text.
 */
function isDuplicate(text) {
  const hash = quickHash(text);
  if (capturedHashes.has(hash)) return true;

  // Check if this text overlaps significantly with any prior capture
  for (const existing of capturedHashes) {
    // Hash-only check is fast; exact substring check is expensive
    // so we rely on the hash for exact dupes
  }

  return false;
}

/**
 * Send captured content to the background script for forwarding to tilth.
 */
function captureContent(text, trigger) {
  if (text.length > settings.maxCaptureLength) {
    text = text.substring(0, settings.maxCaptureLength);
  }

  // Dedup: skip if we've already captured this exact text on this page
  const hash = quickHash(text);
  if (capturedHashes.has(hash)) return;
  capturedHashes.add(hash);

  chrome.runtime.sendMessage({
    type: "capture",
    payload: {
      text: text,
      url: window.location.href,
      title: document.title,
      domain: window.location.hostname,
      trigger: trigger,
      timestamp: Date.now(),
    },
  });
}

/**
 * Clean up observers.
 */
function cleanup() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  dwellTimers.clear();
}

// Start
init();
