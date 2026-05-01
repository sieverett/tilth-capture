/**
 * Stats page — shows capture statistics for the current session.
 */

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function timeSince(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function renderTriggerTags(triggers) {
  return Object.entries(triggers)
    .map(
      ([trigger, count]) =>
        `<span class="trigger-tag ${trigger}">${trigger} ${count > 1 ? "×" + count : ""}</span>`
    )
    .join("");
}

async function loadStats() {
  const stored = await chrome.storage.session.get("captureStats");
  const stats = stored.captureStats || {
    pages: {},
    totalWords: 0,
    totalCaptures: 0,
    sessionStart: Date.now(),
  };

  // Summary
  const pageCount = Object.keys(stats.pages).length;
  document.getElementById("totalWords").textContent = formatNumber(
    stats.totalWords
  );
  document.getElementById("totalCaptures").textContent = formatNumber(
    stats.totalCaptures
  );
  document.getElementById("totalPages").textContent = formatNumber(pageCount);

  // Page list
  const pageList = document.getElementById("pageList");
  const pages = Object.values(stats.pages);

  if (pages.length === 0) {
    pageList.innerHTML =
      '<div class="empty">No captures yet this session.<br>Browse a page and dwell on content to start.</div>';
    return;
  }

  // Sort by words descending
  pages.sort((a, b) => b.words - a.words);

  pageList.innerHTML = pages
    .map(
      (page) => `
    <div class="page-item">
      <div class="page-title" title="${page.title}">${page.title || page.url}</div>
      <div class="page-domain">${page.domain}</div>
      <div class="page-stats">
        <span>${formatNumber(page.words)} words</span>
        <span>${page.captures} capture${page.captures !== 1 ? "s" : ""}</span>
      </div>
      <div class="triggers">${renderTriggerTags(page.triggers)}</div>
    </div>
  `
    )
    .join("");

  // Session info
  document.getElementById("sessionInfo").textContent =
    `Session started ${timeSince(stats.sessionStart)}`;
}

document.getElementById("resetBtn").addEventListener("click", async () => {
  await chrome.storage.session.set({
    captureStats: {
      pages: {},
      totalWords: 0,
      totalCaptures: 0,
      sessionStart: Date.now(),
    },
  });
  await chrome.storage.local.set({ captureCount: 0 });
  chrome.action.setBadgeText({ text: "" });
  loadStats();
});

loadStats();
