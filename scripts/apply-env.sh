#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo ".env file not found. Run scripts/setup.sh first." >&2
  exit 1
fi

source "$ENV_FILE"

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_PUBLISHABLE_KEY:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" || -z "${SYNC_TOKEN:-}" ]]; then
  echo "Missing required values in .env" >&2
  exit 1
fi

CONFIG_JS="$ROOT_DIR/extension/config.js"
WRANGLER_TOML="$ROOT_DIR/worker/wrangler.toml"

node -e "const fs=require('fs');const p='$CONFIG_JS';let s=fs.readFileSync(p,'utf8');s=s.replace(/SUPABASE_URL\s*=\s*\"[^\"]*\"/, 'SUPABASE_URL = \"$SUPABASE_URL\"');s=s.replace(/SUPABASE_PUBLISHABLE_KEY\s*=\s*\"[^\"]*\"/, 'SUPABASE_PUBLISHABLE_KEY = \"$SUPABASE_PUBLISHABLE_KEY\"');fs.writeFileSync(p,s);"

node -e "const fs=require('fs');const p='$WRANGLER_TOML';let s=fs.readFileSync(p,'utf8');s=s.replace(/SUPABASE_URL\s*=\s*\"[^\"]*\"/, 'SUPABASE_URL = \"$SUPABASE_URL\"');s=s.replace(/SUPABASE_PUBLISHABLE_KEY\s*=\s*\"[^\"]*\"/, 'SUPABASE_PUBLISHABLE_KEY = \"$SUPABASE_PUBLISHABLE_KEY\"');fs.writeFileSync(p,s);"

echo "Setting Supabase secrets..."
supabase secrets set SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
supabase secrets set SYNC_TOKEN="$SYNC_TOKEN"

echo "Setting Cloudflare Worker secrets..."
wrangler secret put SUPABASE_SERVICE_ROLE_KEY <<< "$SUPABASE_SERVICE_ROLE_KEY"
wrangler secret put SYNC_TOKEN <<< "$SYNC_TOKEN"

echo "Environment applied successfully."
