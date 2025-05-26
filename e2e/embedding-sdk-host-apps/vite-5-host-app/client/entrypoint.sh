#!/bin/bash
set -e

if [ "$WATCH" = "true" ]; then
  npx vite --host
else
  npx vite preview --host
fi
