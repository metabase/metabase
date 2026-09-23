#!/bin/sh
exec mise exec -- bun "$(dirname "$0")/chat.ts" "$@"
