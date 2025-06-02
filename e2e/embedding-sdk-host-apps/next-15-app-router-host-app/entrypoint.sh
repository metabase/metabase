#!/bin/bash
set -e

rm -rf .next

rm -rf ./local-dist/embedding-sdk
cp -R ../../../resources/embedding-sdk ./local-dist/embedding-sdk

npm ci --install-links

# Reproduce the type conflicts between @types/react
PKG_JSON="./local-dist/embedding-sdk/package.json"
jq '
  .dependencies = ( .dependencies // {} ) + { "@types/react": "^17" }
' "$PKG_JSON" > "${PKG_JSON}.tmp" \
  && mv "${PKG_JSON}.tmp" "$PKG_JSON"
echo "Added \"@types/react\": \"^17\" to $PKG_JSON, installing it..."
npm install file:./local-dist/embedding-sdk --install-links --no-package-lock

export PORT=$CLIENT_PORT

if [ "$WATCH" = "true" ]; then
  npx next dev
else
  npx next build
  npx next start
fi
