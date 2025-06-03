#!/bin/bash
set -e

rm -rf dist
yarn install --frozen-lockfile

if [ "$WATCH" = "true" ]; then
  yarn watch --port $CLIENT_PORT
else
  yarn preview --port $CLIENT_PORT
fi
