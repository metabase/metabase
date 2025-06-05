#!/bin/bash
set -e

rm -rf dist

npm ci --install-links
# To fail for audit warnings and prevent triggering warnings on the Github
npm audit --audit-level=low

if [ "$WATCH" = "true" ]; then
  npx vite --host
else
  npx vite build
  npx vite preview --host
fi
