#!/bin/sh
# Break Metabot's search tool in the running dev-ee: demo/break.sh <throw|swallow|empty|off>
set -eu

case "${1:-}" in
  throw | swallow | empty) value="\"$1\"" ;;
  off) value=null ;;
  *)
    echo "usage: demo/break.sh <throw|swallow|empty|off>" >&2
    exit 2
    ;;
esac

set -a
. "$(dirname "$0")/../.env"
set +a
url="${MB_URL:-http://localhost:3000}/api/setting/metabot-demo-break-search"

curl -fsS -X PUT -H "x-api-key: $MB_API_KEY" -H 'content-type: application/json' -d "{\"value\": $value}" "$url"
mode=$(curl -fsS -H "x-api-key: $MB_API_KEY" "$url")
echo "metabot-demo-break-search: ${mode:-off}"
