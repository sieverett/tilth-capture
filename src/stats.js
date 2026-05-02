/**
 * Stats page — shows capture statistics for the current session.
 * Cards are one-line, collapsed by default, accordion behavior.
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
        `<span class="trigger-tag ${trigger}">${trigger}${count > 1 ? " \u00d7" + count : ""}</span>`
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
  document.getElementById("totalWords").textContent = formatNumber(stats.totalWords);
  document.getElementById("totalCaptures").textContent = formatNumber(stats.totalCaptures);
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
      (page, i) => `
    <div class="page-item" data-index="${i}">
      <div class="page-header">
        <span class="page-title" title="${page.title || page.url}">${page.title || page.url}</span>
        <span class="page-words">${formatNumber(page.words)}w</span>
        <span class="chevron" data-index="${i}">\u25B6</span>
      </div>
      <div class="page-details" data-index="${i}">
        <div class="page-domain">${page.domain}</div>
        <div class="page-stats">
          <span>${page.captures} capture${page.captures !== 1 ? "s" : ""}</span>
        </div>
        <div class="triggers">${renderTriggerTags(page.triggers)}</div>
      </div>
    </div>
  `
    )
    .join("");

  // Accordion: click to expand, collapse others
  pageList.addEventListener("click", (e) => {
    const item = e.target.closest(".page-item");
    if (!item) return;

    const index = item.dataset.index;
    const details = item.querySelector(".page-details");
    const chevron = item.querySelector(".chevron");
    const isOpen = details.classList.contains("open");

    // Close all
    pageList.querySelectorAll(".page-details").forEach((d) => d.classList.remove("open"));
    pageList.querySelectorAll(".chevron").forEach((c) => c.classList.remove("open"));

    // Toggle clicked
    if (!isOpen) {
      details.classList.add("open");
      chevron.classList.add("open");
    }
  });

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
  chrome.action.setBadgeText({ text: "" });
  loadStats();
});

loadStats();
