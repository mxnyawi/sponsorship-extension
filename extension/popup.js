function setStatus(status, message) {
  const statusEl = document.getElementById("status");
  statusEl.textContent = message;
  statusEl.className = `status-card ${status}`;

  const pill = document.getElementById("status-pill");
  if (status === "ok") pill.textContent = "Sponsor";
  else if (status === "err") pill.textContent = "No Sponsor";
  else if (status === "warn") pill.textContent = "Unclear";
  else if (status === "rate") pill.textContent = "Rate Limit";
  else pill.textContent = "Checking";
}

function setCompany(name) {
  const companyEl = document.getElementById("company");
  companyEl.textContent = name ? `Company: ${name}` : "Company not detected";
  const companyName = document.getElementById("company-name");
  companyName.textContent = name || "--";
}

function setLastUpdated(matches) {
  const note = document.querySelector(".note");
  if (!note) return;
  const updated = matches?.[0]?.last_updated;
  if (!updated) {
    note.textContent = "Verify on official register.";
    return;
  }
  note.textContent = `Register updated: ${updated}`;
}

function setMatches(matches) {
  const matchesEl = document.getElementById("matches");
  matchesEl.innerHTML = "";
  if (!matches || matches.length === 0) {
    matchesEl.textContent = "No matches to show.";
    return;
  }
  const top = matches[0];
  const location = [top?.town_city, top?.county].filter(Boolean).join(", ");
  const sponsorType = top?.sponsor_type || "--";
  const route = top?.route || "--";

  document.getElementById("company-location").textContent = location || "--";
  document.getElementById("sponsor-type").textContent = sponsorType;
  document.getElementById("visa-route").textContent = route;

  matches.slice(0, 3).forEach((match) => {
    const row = document.createElement("div");
    row.className = "match";
    const score = match.score ? `${Math.round(match.score * 100)}%` : "";
    const town = match.town_city ? ` · ${escapeHtml(match.town_city)}` : "";
    const county = match.county ? `, ${escapeHtml(match.county)}` : "";
    const type = match.sponsor_type ? ` · ${escapeHtml(match.sponsor_type)}` : "";
    const route = match.route ? ` · ${escapeHtml(match.route)}` : "";
    row.innerHTML = `<span>${escapeHtml(match.name_original)}${town}${county}${type}${route}</span><span>${score}</span>`;
    matchesEl.appendChild(row);
  });

  const topScore = matches[0]?.score ? Math.round(matches[0].score * 100) : 0;
  document.getElementById("confidence-fill").style.width = `${topScore}%`;
  document.getElementById("confidence-value").textContent = `${topScore}%`;
  setLastUpdated(matches);
}

function escapeHtml(input) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("err", "No active tab.");
    return;
  }

  setStatus("", "Checking sponsor register...");

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_COMPANY" });
      if (!response?.companyName) {
        setCompany("");
        setStatus("warn", "Open a LinkedIn or Indeed job page.");
        document.getElementById("company-location").textContent = "--";
        document.getElementById("sponsor-type").textContent = "--";
        document.getElementById("visa-route").textContent = "--";
        document.getElementById("confidence-fill").style.width = "0%";
        document.getElementById("confidence-value").textContent = "--";
        document.querySelector(".note").textContent = "Verify on official register.";
        setMatches([]);
        return;
      }

    setCompany(response.companyName);

    chrome.runtime.sendMessage(
      { type: "LOOKUP_SPONSOR", companyName: response.companyName },
      (res) => {
        if (!res || !res.ok) {
          setStatus("err", "Lookup failed.");
          document.getElementById("company-location").textContent = "--";
          document.getElementById("sponsor-type").textContent = "--";
          document.getElementById("visa-route").textContent = "--";
          document.getElementById("confidence-fill").style.width = "0%";
          document.getElementById("confidence-value").textContent = "--";
          document.querySelector(".note").textContent = "Verify on official register.";
          setMatches([]);
          return;
        }
        const result = res.result;
        if (result.status === "likely") {
          setStatus("ok", "Sponsors! ✅");
        } else if (result.status === "not_found") {
          setStatus("err", "Doesn’t sponsor ❌");
        } else if (result.status === "rate_limited") {
          setStatus("rate", "Rate limited — try later");
        } else {
          setStatus("warn", "Unclear — check matches");
        }
        setMatches(result.matches);
      }
    );
  } catch (error) {
    setCompany("");
    setStatus("warn", "Open a LinkedIn or Indeed job page.");
    document.getElementById("company-location").textContent = "--";
    document.getElementById("sponsor-type").textContent = "--";
    document.getElementById("visa-route").textContent = "--";
    document.getElementById("confidence-fill").style.width = "0%";
    document.getElementById("confidence-value").textContent = "--";
    setMatches([]);
  }

  const copyButton = document.getElementById("copy");
  copyButton.addEventListener("click", async () => {
    const company = document.getElementById("company-name").textContent;
    if (!company || company === "--") return;
    await navigator.clipboard.writeText(company);
    copyButton.textContent = "Copied";
    setTimeout(() => {
      copyButton.textContent = "Copy company";
    }, 1200);
  });
}

document.addEventListener("DOMContentLoaded", init);
