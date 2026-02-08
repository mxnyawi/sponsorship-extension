const SUPABASE_SEARCH_RPC = "search_sponsors_limited";
const SIMILARITY_THRESHOLD = 0.82;
const RESULT_LIMIT = 5;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAYS = [300, 900, 1800];

import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
} from "./config.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "LOOKUP_SPONSOR") {
    lookupSponsor(message.companyName)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("[VisaSponsor] Lookup failed", error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }
  return false;
});

async function lookupSponsor(companyName) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase config in extension/config.js");
  }
  if (!companyName) {
    throw new Error("No company name provided");
  }

  const cached = await getCached(companyName);
  if (cached) {
    return cached;
  }

  console.log("[VisaSponsor] Lookup", companyName, SUPABASE_URL);

  const clientKey = await getClientKey();

  const payload = {
    query: companyName,
    client_key: clientKey,
    limit_count: RESULT_LIMIT,
    similarity_threshold: SIMILARITY_THRESHOLD,
    limit_per_hour: 120
  };

  const res = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/rpc/${SUPABASE_SEARCH_RPC}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_PUBLISHABLE_KEY,
      "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[VisaSponsor] Supabase error", res.status, text);
    throw new Error(`Supabase search failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const parsed = interpretResult(data);
  await setCached(companyName, parsed, data?.[0]?.reset_at);
  await sendTelemetry(clientKey, parsed.status);
  return parsed;
}

function interpretResult(matches) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return { status: "not_found", matches: [] };
  }

  const limited = matches[0]?.allowed === false;
  if (limited) {
    return { status: "rate_limited", matches: [] };
  }

  const top = matches[0];
  if (top.match_type === "exact" || top.score >= SIMILARITY_THRESHOLD) {
    return { status: "likely", matches };
  }

  if (top.score >= 0.72) {
    return { status: "unclear", matches };
  }

  return { status: "not_found", matches };
}

async function fetchWithRetry(url, options) {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status < 500) {
        return res;
      }
    } catch (error) {
      if (attempt >= RETRY_DELAYS.length) throw error;
    }
    const delay = RETRY_DELAYS[attempt] || 0;
    attempt += 1;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function getClientKey() {
  const stored = await chrome.storage.local.get("clientKey");
  if (stored?.clientKey) return stored.clientKey;
  const key = crypto.randomUUID();
  await chrome.storage.local.set({ clientKey: key });
  return key;
}

async function sendTelemetry(clientKey, status) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/telemetry_events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
      },
      body: JSON.stringify({
        client_key: clientKey,
        event_type: "lookup",
        status
      })
    });
  } catch (error) {
    console.warn("[VisaSponsor] Telemetry failed", error);
  }
}

function normalizeKey(name) {
  return name.toLowerCase().trim();
}

async function getCached(companyName) {
  const key = normalizeKey(companyName);
  const stored = await chrome.storage.local.get(["cache", "cacheMeta"]);
  const cache = stored.cache || {};
  const meta = stored.cacheMeta || {};
  const entry = cache[key];
  const expiry = meta[key];
  if (!entry || !expiry) return null;
  if (Date.now() > expiry) return null;
  return entry;
}

async function setCached(companyName, result, resetAt) {
  const key = normalizeKey(companyName);
  const stored = await chrome.storage.local.get(["cache", "cacheMeta"]);
  const cache = stored.cache || {};
  const meta = stored.cacheMeta || {};
  cache[key] = result;
  const ttl = resetAt ? Math.max(new Date(resetAt).getTime() - Date.now(), 0) : CACHE_TTL_MS;
  meta[key] = Date.now() + ttl;
  await chrome.storage.local.set({ cache, cacheMeta: meta });
}
