/**
 * Default configuration. Overridden by user settings in chrome.storage.
 */
export const DEFAULTS = {
  // Tilth gateway
  gatewayUrl: "http://localhost:8001",
  identity: "browser-capture",
  namespace: "web",

  // Dwell detection
  dwellThresholdMs: 20000, // 20 seconds
  minTextLength: 50, // ignore trivial elements
  maxCaptureLength: 256 * 1024, // 256KB — matches tilth client limit

  // Behavior
  enabled: true,
  allowedDomains: [], // empty = all domains when enabled
  pausedUntil: null, // timestamp or null
};

/**
 * Load settings from chrome.storage, merged with defaults.
 */
export async function loadSettings() {
  const stored = await chrome.storage.sync.get("tilthCapture");
  return { ...DEFAULTS, ...(stored.tilthCapture || {}) };
}

/**
 * Save settings to chrome.storage.
 */
export async function saveSettings(settings) {
  await chrome.storage.sync.set({ tilthCapture: settings });
}
