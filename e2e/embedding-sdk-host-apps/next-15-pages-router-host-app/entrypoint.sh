#!/bin/bash
set -e

rm -rf .next
npm ci --install-links

export PORT=$CLIENT_PORT

if [ "$WATCH" = "true" ]; then
  npx next dev
else
  npx next build
  npx next start
fi
