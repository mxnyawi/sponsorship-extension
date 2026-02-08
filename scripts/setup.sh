#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI not found. Install it first." >&2
  exit 1
fi

if ! command -v wrangler >/dev/null 2>&1; then
  echo "Wrangler CLI not found. Install it first." >&2
  exit 1
fi

echo "Visa Sponsor Checker setup"
echo "--------------------------------"

read -r -p "Supabase project URL (https://<project>.supabase.co): " SUPABASE_URL
read -r -p "Supabase publishable key: " SUPABASE_PUBLISHABLE_KEY
read -r -s -p "Supabase secret/service role key: " SUPABASE_SERVICE_ROLE_KEY
echo
read -r -s -p "Sync token (generate a strong random string): " SYNC_TOKEN
echo

if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_PUBLISHABLE_KEY" || -z "$SUPABASE_SERVICE_ROLE_KEY" || -z "$SYNC_TOKEN" ]]; then
  echo "All values are required." >&2
  exit 1
fi

CONFIG_JS="$ROOT_DIR/extension/config.js"
WRANGLER_TOML="$ROOT_DIR/worker/wrangler.toml"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$CONFIG_JS" ]]; then
  echo "Missing extension/config.js" >&2
  exit 1
fi

if [[ ! -f "$WRANGLER_TOML" ]]; then
  echo "Missing worker/wrangler.toml" >&2
  exit 1
fi

cat > "$ENV_FILE" <<EOF
SUPABASE_URL="$SUPABASE_URL"
SUPABASE_PUBLISHABLE_KEY="$SUPABASE_PUBLISHABLE_KEY"
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
SYNC_TOKEN="$SYNC_TOKEN"
EOF

node -e "const fs=require('fs');const p='$CONFIG_JS';let s=fs.readFileSync(p,'utf8');s=s.replace(/SUPABASE_URL\s*=\s*\"[^\"]*\"/, 'SUPABASE_URL = \"$SUPABASE_URL\"');s=s.replace(/SUPABASE_PUBLISHABLE_KEY\s*=\s*\"[^\"]*\"/, 'SUPABASE_PUBLISHABLE_KEY = \"$SUPABASE_PUBLISHABLE_KEY\"');fs.writeFileSync(p,s);"

node -e "const fs=require('fs');const p='$WRANGLER_TOML';let s=fs.readFileSync(p,'utf8');s=s.replace(/SUPABASE_URL\s*=\s*\"[^\"]*\"/, 'SUPABASE_URL = \"$SUPABASE_URL\"');s=s.replace(/SUPABASE_PUBLISHABLE_KEY\s*=\s*\"[^\"]*\"/, 'SUPABASE_PUBLISHABLE_KEY = \"$SUPABASE_PUBLISHABLE_KEY\"');fs.writeFileSync(p,s);"

"$ROOT_DIR/scripts/apply-env.sh"

echo "Applying Supabase migrations..."
supabase db push

echo "Deploying Supabase Edge Function..."
supabase functions deploy sync-sponsors

echo "Deploying Cloudflare Worker..."
(cd "$ROOT_DIR/worker" && wrangler deploy)

echo "Setup complete. Load the extension from: $ROOT_DIR/extension"
echo "Saved configuration to: $ENV_FILE"
