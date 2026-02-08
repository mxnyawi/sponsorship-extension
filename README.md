# Visa Sponsor Checker

Browser extension that checks whether a company appears in the UK Home Office sponsor register and surfaces sponsor type + visa route directly from LinkedIn/Indeed job pages.

## What it does

- Extracts company names from job listings.
- Matches against the official register of licensed sponsors.
- Shows sponsor type, visa route, and location.
- Refreshes data on a schedule.

## Architecture

- **Extension (MV3)**: UI + scraping + lookups.
- **Supabase**: data store + search RPC + rate limiting + telemetry.
- **Supabase Edge Function**: CSV ingestion and bulk upsert.
- **Cloudflare Worker**: scheduled trigger and manual sync endpoint.

## Repository layout

- `extension/` – Chrome/Brave extension
- `worker/` – Cloudflare Worker + scheduler
- `supabase/` – SQL migrations + Edge Functions

## Prerequisites

- Node.js 18+
- Supabase CLI
- Cloudflare Wrangler

## Setup

### Quick setup script

Run:

```bash
./scripts/setup.sh
```

It prompts for Supabase/Cloudflare details, writes `.env`, applies secrets, migrations, and deploys.

It also writes a local `.env` file (not committed) based on your inputs.

### 1) Supabase project

1. Create a Supabase project.
2. Run migrations:
   ```
   supabase db push
   ```
3. Deploy Edge Function:
   ```
   supabase functions deploy sync-sponsors
   ```
4. Set required secrets:
   ```
   supabase secrets set SERVICE_ROLE_KEY="<SUPABASE_SECRET_KEY>"
   supabase secrets set SYNC_TOKEN="<SYNC_TOKEN>"
   ```

### 2) Cloudflare Worker

1. Update `worker/wrangler.toml` with your Supabase URL + publishable key.
2. Set secrets:
   ```
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   wrangler secret put SYNC_TOKEN
   ```
3. Deploy:
   ```
   cd worker
   wrangler deploy
   ```

### 3) Extension config

Edit `extension/config.js`:

```js
const SUPABASE_URL = "https://<project>.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "<publishable-key>";
```

### Apply config from .env

If you update `.env`, re-apply it:

```bash
./scripts/apply-env.sh
```

### 3b) Worker config

Edit `worker/wrangler.toml`:

```toml
SUPABASE_URL = "https://<project>.supabase.co"
SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"
```

### 4) Load the extension

1. Open `brave://extensions` or `chrome://extensions`.
2. Enable Developer Mode.
3. Click **Load unpacked** and select `extension/`.

## Manual sync (on-demand)

```bash
curl -H "x-sync-token: <SYNC_TOKEN>" https://<worker-url>/sync
```

## Data source

UK Home Office register of licensed sponsors:
https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers

## Testing

Quick query check:

```bash
curl -s \
  -H "apikey: <publishable-key>" \
  -H "Authorization: Bearer <publishable-key>" \
  -H "Content-Type: application/json" \
  -d '{"query":"Deloitte","client_key":"test","limit_count":5,"similarity_threshold":0.82}' \
  https://<project>.supabase.co/rest/v1/rpc/search_sponsors_limited
```

## Security notes

- Keep Supabase secret keys out of the extension.
- The extension uses publishable keys only.
- Edge Function uses a separate SYNC_TOKEN.
- `.env` is local only; use `.env.example` as reference.

## License

MIT
