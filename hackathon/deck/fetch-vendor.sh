#!/usr/bin/env bash
# Restore the deck's vendored libraries (not committed): reveal.js 5.2.1 and mermaid 11.4.1, from jsdelivr.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p vendor
curl -fsSL https://registry.npmjs.org/reveal.js/-/reveal.js-5.2.1.tgz | tar -xz -C vendor
rm -rf vendor/reveal.js && mv vendor/package vendor/reveal.js
curl -fsSL -o vendor/mermaid.min.js https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js
echo "vendor/ restored"
