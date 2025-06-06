#!/bin/bash
set -e

rm -rf dist

npm ci --install-links
# To fail for audit warnings and prevent triggering warnings on the Github
npm audit --audit-level=low

npm i ../../../resources/embedding-sdk --install-links --no-save --no-package-lock

if [ "$WATCH" = "true" ]; then
  npx vite --host
else
  npx vite build
  npx vite preview --host
fi
