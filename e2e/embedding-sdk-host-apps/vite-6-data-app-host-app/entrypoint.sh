#!/bin/bash
set -e

rm -rf dist

npm ci --install-links

npm i ../../../resources/embedding-sdk --install-links --no-save

npx vite --host
