#!/bin/bash
set -e

rm -rf dist

HOST_APP_DIR="$(pwd)"

npm ci --install-links

npm i ../../../resources/embedding-sdk --install-links --no-save --no-package-lock

if [ "$WATCH" = "true" ]; then
  npm run watch -- --port $CLIENT_PORT
else
  npm run preview -- --port $CLIENT_PORT
fi
