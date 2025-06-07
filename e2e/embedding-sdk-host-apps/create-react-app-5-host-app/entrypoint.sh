#!/bin/bash
set -e

rm -rf build

npm ci --install-links
# To fail for audit warnings and prevent triggering warnings on the Github
npm audit --audit-level=low

npm i ../../../resources/embedding-sdk --install-links --no-save --no-package-lock

if [ "$WATCH" = "true" ]; then
  PORT=$CLIENT_PORT npm run dev
else
  npm run build
  npm run preview -- -p $CLIENT_PORT
fi
