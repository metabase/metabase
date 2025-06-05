#!/bin/bash
set -e

rm -rf .next

npm ci --install-links
# To fail for audit warnings and prevent triggering warnings on the Github
npm audit --audit-level=low

export PORT=$CLIENT_PORT

if [ "$WATCH" = "true" ]; then
  npx next dev
else
  npx next build
  npx next start
fi
