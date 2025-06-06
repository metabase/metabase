#!/bin/bash
set -e

rm -rf dist

HOST_APP_DIR="$(pwd)"

npm ci --install-links
# To fail for audit warnings and prevent triggering warnings on the Github
npm audit --audit-level=low

npm i ../../../resources/embedding-sdk --install-links --no-save --no-package-lock

if [ "$WATCH" = "true" ]; then
  npm run watch -- --port $CLIENT_PORT
else
  npm run preview -- --port $CLIENT_PORT
fi
