#!/usr/bin/env bash

set -euo pipefail

DOCS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMEOUT=10
FAILED=()
UPDATED=()
SKIPPED=()

# Check internet connectivity
if ! curl -sf --max-time 5 https://github.com > /dev/null 2>&1; then
  echo "[bootup] No internet connection — skipping doc refresh, using cached docs."
  exit 0
fi

echo "[bootup] Refreshing docs in $DOCS_DIR..."

REPOS=(
  opensips
  sipjs
  ejabberd
  rtpengine
  react-native
  nodejs
  express
  kubernetes
  helm
  ioredis
  jest
  supertest
  nock
)

for repo in "${REPOS[@]}"; do
  dir="$DOCS_DIR/$repo"
  if [ ! -d "$dir/.git" ]; then
    SKIPPED+=("$repo (not found)")
    continue
  fi

  result=$(git -C "$dir" pull --ff-only --quiet 2>&1) && {
    if echo "$result" | grep -q "Already up to date"; then
      SKIPPED+=("$repo (already up to date)")
    else
      UPDATED+=("$repo")
    fi
  } || {
    FAILED+=("$repo")
  }
done

# Summary
echo ""
if [ ${#UPDATED[@]}  -gt 0 ]; then
  echo "[bootup] ✅ Updated:  ${UPDATED[*]}"
fi
if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "[bootup] ⏭  Skipped:  ${SKIPPED[*]}"
fi
if [ ${#FAILED[@]}  -gt 0 ]; then
  echo "[bootup] ❌ Failed:   ${FAILED[*]}"
fi
echo "[bootup] Done. Starting MCP server..."
