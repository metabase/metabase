#!/bin/bash
set -e

rm -rf dist

yarn install --frozen-lockfile
# To fail for audit warnings and prevent triggering warnings on the Github
yarn audit --level low

if [ "$WATCH" = "true" ]; then
  yarn watch --port $CLIENT_PORT
else
  yarn preview --port $CLIENT_PORT
fi
