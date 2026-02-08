const BADGE_ID = "visa-sponsor-badge";
const DEBUG = true;

init();

async function init() {
  if (document.getElementById(BADGE_ID)) return;
  const companyName = extractCompanyName();
  if (!companyName) return;

  const badge = createBadge();
  document.body.appendChild(badge);
  setBadgeState(badge, "loading", companyName);

chrome.runtime.sendMessage(
    { type: "LOOKUP_SPONSOR", companyName },
    (response) => {
      if (!response || !response.ok) {
        setBadgeState(badge, "error", companyName);
        return;
      }
      setBadgeState(badge, response.result.status, companyName, response.result.matches);
    }
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "EXTRACT_COMPANY") {
    const companyName = extractCompanyName();
    if (DEBUG) console.log("[VisaSponsor] EXTRACT_COMPANY", companyName);
    sendResponse({ companyName });
    return true;
  }
  return false;
});

function extractCompanyName() {
  const host = window.location.host;
  if (host.includes("linkedin.com")) {
    return extractLinkedInCompany();
  }
  if (host.includes("indeed.com")) {
    return extractIndeedCompany();
  }
  return null;
}

function extractLinkedInCompany() {
  const selectors = [
    "a.topcard__org-name-link",
    "a.topcard__org-name-link[href]",
    "span.topcard__flavor a",
    "a[data-control-name='jobdetails_topcard_inapp_company_url']",
    "a.job-details-jobs-unified-top-card__company-name",
    "span.job-details-jobs-unified-top-card__company-name",
    "div.job-details-jobs-unified-top-card__company-name a"
  ];
  if (DEBUG) console.log("[VisaSponsor] LinkedIn selectors", selectors);
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent) {
      const value = el.textContent.trim();
      if (DEBUG) console.log("[VisaSponsor] LinkedIn match", selector, value);
      return value;
    }
  }
  const companyName = document.querySelector(".job-details-jobs-unified-top-card__company-name");
  if (companyName && companyName.textContent) {
    const value = companyName.textContent.trim();
    if (DEBUG) console.log("[VisaSponsor] LinkedIn fallback", value);
    return value;
  }
  const meta = document.querySelector("meta[property='og:description']");
  if (meta?.content) {
    const match = meta.content.match(/at\s+([^\n\|]+)/i);
    if (match) {
      const value = match[1].trim();
      if (DEBUG) console.log("[VisaSponsor] LinkedIn meta", value);
      return value;
    }
  }
  if (DEBUG) console.log("[VisaSponsor] LinkedIn company not found");
  return null;
}

function extractIndeedCompany() {
  const selectors = [
    "div.jobsearch-CompanyInfoContainer a",
    "div[data-company-name]",
    "div.jobsearch-CompanyInfoWithoutHeaderImage div",
    "div.jobsearch-CompanyInfoContainer div"
  ];
  if (DEBUG) console.log("[VisaSponsor] Indeed selectors", selectors);
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent) {
      const value = el.textContent.trim();
      if (DEBUG) console.log("[VisaSponsor] Indeed match", selector, value);
      return value;
    }
  }
  const meta = document.querySelector("meta[property='og:description']");
  if (meta?.content) {
    const match = meta.content.match(/at\s+([^\n\|]+)/i);
    if (match) {
      const value = match[1].trim();
      if (DEBUG) console.log("[VisaSponsor] Indeed meta", value);
      return value;
    }
  }
  if (DEBUG) console.log("[VisaSponsor] Indeed company not found");
  return null;
}

function createBadge() {
  const badge = document.createElement("div");
  badge.id = BADGE_ID;
  badge.style.position = "fixed";
  badge.style.bottom = "20px";
  badge.style.right = "20px";
  badge.style.zIndex = "2147483647";
  badge.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
  badge.style.padding = "12px 14px";
  badge.style.borderRadius = "10px";
  badge.style.background = "#0f172a";
  badge.style.color = "#f8fafc";
  badge.style.boxShadow = "0 10px 30px rgba(0,0,0,0.2)";
  badge.style.maxWidth = "280px";
  badge.style.fontSize = "13px";
  badge.style.lineHeight = "1.4";
  badge.style.cursor = "pointer";
  badge.style.userSelect = "none";
  badge.style.transition = "transform 0.2s ease, box-shadow 0.2s ease";
  badge.addEventListener("mouseenter", () => {
    badge.style.transform = "translateY(-2px)";
    badge.style.boxShadow = "0 14px 36px rgba(0,0,0,0.25)";
  });
  badge.addEventListener("mouseleave", () => {
    badge.style.transform = "translateY(0)";
    badge.style.boxShadow = "0 10px 30px rgba(0,0,0,0.2)";
  });
  return badge;
}

function setBadgeState(badge, state, companyName, matches = []) {
  const titleMap = {
    loading: "Checking sponsor register...",
    likely: "Likely sponsor",
    not_found: "Not found",
    unclear: "Unclear",
    error: "Error"
  };

  const colorMap = {
    loading: "#0f172a",
    likely: "#065f46",
    not_found: "#7c2d12",
    unclear: "#92400e",
    error: "#7f1d1d"
  };

  badge.style.background = colorMap[state] || "#0f172a";

  const header = `<div style="font-weight:600; font-size:14px; margin-bottom:6px;">${titleMap[state] || "Status"}</div>`;
  const companyLine = `<div style="opacity:0.9;">${escapeHtml(companyName)}</div>`;
  const details = buildDetails(state, matches);

  badge.innerHTML = header + companyLine + details;
}

function buildDetails(state, matches) {
  if (state === "loading") {
    return "<div style=\"margin-top:6px; opacity:0.8;\">Searching official register...</div>";
  }
  if (state === "error") {
    return "<div style=\"margin-top:6px; opacity:0.8;\">Check extension config.</div>";
  }
  if (!matches || matches.length === 0) {
    return "<div style=\"margin-top:6px; opacity:0.8;\">No sponsor match found.</div>";
  }

  const listItems = matches.slice(0, 3).map((match) => {
    const score = match.score ? `${Math.round(match.score * 100)}%` : "";
    return `<div style=\"margin-top:4px;\">${escapeHtml(match.name_original)} <span style=\"opacity:0.8;\">${score}</span></div>`;
  }).join("");

  const footer = "<div style=\"margin-top:8px; font-size:12px; opacity:0.8;\">Verify on gov.uk register.</div>";
  return `<div style=\"margin-top:6px;\">${listItems}</div>${footer}`;
}

function escapeHtml(input) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
