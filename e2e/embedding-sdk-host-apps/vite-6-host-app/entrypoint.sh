#!/bin/bash
set -e

rm -rf dist

npm ci --install-links

npm i ../../../resources/embedding-sdk --install-links --no-save

if [ "$WATCH" = "true" ]; then
  npx vite --host
else
  npx vite build
  npx vite preview --host
fi
