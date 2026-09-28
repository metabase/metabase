#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(node -p 'require("@playwright/test/package.json").version')

exec docker run --rm --init --ipc=host \
  --platform=linux/amd64 \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp \
  --env CI \
  --env STORYBOOK_URL \
  --env VISUAL_FILES \
  --env VISUAL_GREP \
  --env VISUAL_PROFILE \
  --env VISUAL_PROFILE_DIR \
  --env VISUAL_SNAPSHOT_DIR \
  --env VISUAL_WORKERS \
  --volume "$PWD:/work" \
  --workdir /work \
  "mcr.microsoft.com/playwright:v${version}-noble" \
  ./node_modules/.bin/playwright test -c e2e-visual/playwright.config.ts "$@"
