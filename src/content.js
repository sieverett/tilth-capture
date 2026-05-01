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
    pausedUntil: null,
    ...((stored && stored.tilthCapture) || {}),
  };

  if (!shouldRun()) return;

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

  if (settings.allowedDomains.length > 0) {
    const hostname = window.location.hostname;
    return settings.allowedDomains.some(
      (d) => hostname === d || hostname.endsWith("." + d)
    );
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
  document.querySelectorAll(CONTENT_SELECTORS).forEach((el) => {
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
        captureContent(text.trim(), "dwell");
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
    } else if (msg.type === "capture-page") {
      const main =
        document.querySelector("article") ||
        document.querySelector("[role='main']") ||
        document.querySelector("main") ||
        document.body;
      const text = main.innerText || "";
      if (text.trim().length > 0) {
        captureContent(text.trim(), "page");
      }
    }
  });
}

/**
 * Send captured content to the background script for forwarding to tilth.
 */
function captureContent(text, trigger) {
  if (text.length > settings.maxCaptureLength) {
    text = text.substring(0, settings.maxCaptureLength);
  }

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
