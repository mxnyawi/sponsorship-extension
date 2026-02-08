const REGISTER_URL = "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/sync") {
      const token = request.headers.get("x-sync-token") || url.searchParams.get("token");
      if (!env.SYNC_TOKEN || token !== env.SYNC_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }
      const result = await triggerSupabaseSync(env);
      return new Response(result, { status: 200 });
    }
    return new Response("OK", { status: 200 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(triggerSupabaseSync(env));
  }
};

async function triggerSupabaseSync(env) {
  if (!env.SUPABASE_URL) {
    throw new Error("Missing Supabase config");
  }

  if (!env.SYNC_TOKEN) {
    throw new Error("Missing SYNC_TOKEN for function auth");
  }

  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/sync-sponsors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "x-function-token": env.SYNC_TOKEN
    },
    body: JSON.stringify({ register_url: REGISTER_URL })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase sync failed: ${res.status} ${text}`);
  }

  return await res.text();
}
