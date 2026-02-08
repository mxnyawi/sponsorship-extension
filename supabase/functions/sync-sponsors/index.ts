import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const REGISTER_URL = "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers";

serve(async (req) => {
  const token = req.headers.get("x-function-token");
  const expected = Deno.env.get("SYNC_TOKEN");
  if (!expected || token !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return new Response("Missing Supabase config", { status: 500 });
  }

  let registerUrl = REGISTER_URL;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body?.register_url) registerUrl = body.register_url;
    } catch (_) {
      // ignore body parsing errors
    }
  }

  try {
    const csvUrl = await resolveCsvUrl(registerUrl);
    const csvRes = await fetch(csvUrl);
    if (!csvRes.ok) {
      return new Response(`CSV fetch failed: ${csvRes.status}`, { status: 500 });
    }
    const today = new Date().toISOString().slice(0, 10);
    const body = csvRes.body;
    if (!body) {
      return new Response("CSV response body missing", { status: 500 });
    }

    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    let isHeader = true;
    let buffer = "";
    let batch: Array<Record<string, string>> = [];
    let rowBuffer = "";
    let quoteCount = 0;

    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        if (!rawLine) continue;
        const line = rawLine.replace(/\r$/, "");

        rowBuffer += rowBuffer ? `\n${line}` : line;
        quoteCount += (line.match(/\"/g) || []).length;

        if (quoteCount % 2 === 1) {
          continue;
        }

        const cols = parseCsvLine(rowBuffer);
        rowBuffer = "";
        quoteCount = 0;

        if (isHeader) {
          isHeader = false;
          continue;
        }

        if (cols.length < 2) continue;
        const nameOriginal = cols[0] || "";
        const townCity = cols[1] || "";
        const county = cols[2] || "";
        const sponsorType = cols[3] || "";
        const route = cols[4] || "";
        const nameNormalized = normalizeName(nameOriginal);
        if (!nameOriginal || !nameNormalized) continue;

        batch.push({
          name_original: nameOriginal,
          name_normalized: nameNormalized,
          town_city: townCity,
          county,
          sponsor_type: sponsorType,
          route,
          register_url: registerUrl,
          last_updated: today
        });
        total += 1;

        if (batch.length >= 2000) {
          await upsertBatch(supabaseUrl, serviceKey, dedupeRows(batch));
          batch = [];
        }
      }
    }

    if (rowBuffer) {
      const cols = parseCsvLine(rowBuffer);
      if (!isHeader && cols.length >= 2) {
        const nameOriginal = cols[0] || "";
        const townCity = cols[1] || "";
        const county = cols[2] || "";
        const sponsorType = cols[3] || "";
        const route = cols[4] || "";
        const nameNormalized = normalizeName(nameOriginal);
        if (nameOriginal && nameNormalized) {
          batch.push({
            name_original: nameOriginal,
            name_normalized: nameNormalized,
            town_city: townCity,
            county,
            sponsor_type: sponsorType,
            route,
            register_url: registerUrl,
            last_updated: today
          });
        }
      }
    }

    if (batch.length > 0) {
      await upsertBatch(supabaseUrl, serviceKey, dedupeRows(batch));
    }
    console.log(`Sync complete. Rows processed: ${total}`);
    return new Response(`Sync complete. Rows processed: ${total}`, { status: 200 });
  } catch (error) {
    const message = String(error?.message || error);
    console.error("Sync error:", message);
    return new Response(message, { status: 500 });
  }
});

async function resolveCsvUrl(registerUrl: string) {
  const pageRes = await fetch(registerUrl);
  if (!pageRes.ok) {
    throw new Error(`Register page fetch failed: ${pageRes.status}`);
  }
  const html = await pageRes.text();
  const match = html.match(/https:\/\/[^\"']+\.csv/);
  if (!match) {
    throw new Error("CSV link not found on register page");
  }
  return match[0];
}

function parseCsvLine(line: string) {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

function normalizeName(input: string) {
  let cleaned = (input || "").toLowerCase();
  cleaned = cleaned.replace(/[^a-z0-9\s]/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/\b(limited|ltd|plc|llp|inc|co|corp|company|group|holdings|the)\b/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

function dedupeRows(rows: Array<{ name_original: string; sponsor_type: string; route?: string; town_city?: string; county?: string }>) {
  const seen = new Set<string>();
  const out = [];
  for (const row of rows) {
    const key = `${row.name_original}::${row.sponsor_type}::${row.route || ''}::${row.town_city || ''}::${row.county || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function upsertBatch(supabaseUrl: string, serviceKey: string, payload: Array<Record<string, string>>) {
  if (payload.length === 0) return;
  const upsertRes = await fetch(`${supabaseUrl}/rest/v1/rpc/bulk_upsert_sponsors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({ payload })
  });

  if (!upsertRes.ok) {
    const text = await upsertRes.text();
    throw new Error(`Supabase upsert failed: ${upsertRes.status} ${text}`);
  }
}
