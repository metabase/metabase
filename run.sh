#!/usr/bin/env bash

set -e

get_branch_slug() {
    local branch
    branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

    local slug
    slug=$(echo "$branch" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g' | sed -E 's/^-+|-+$//g')

    local hash
    hash=$(echo -n "$branch" | md5sum | cut -c1-6)

    echo "${slug:0:20}-$hash"
}

OVERMIND_TITLE=$(get_branch_slug)
export OVERMIND_TITLE

# Get one random available port per process
read -r MB_JETTY_PORT MB_FRONTEND_DEV_PORT JWT_IDP_PORT <<< "$(go run ./cmd/mb-proxy ports --count 3)"

export MB_JETTY_PORT
export MB_FRONTEND_DEV_PORT
export JWT_IDP_PORT
MB_SITE_URL=https://${OVERMIND_TITLE:-dev}.metabase.localhost
export MB_SITE_URL

OVERMIND_SOCKET=./.overmind.$OVERMIND_TITLE.sock
export OVERMIND_SOCKET

# Ensure shared Caddy is running (single instance on 80/443)
ensure_caddy() {
    if curl -sf http://localhost:2019/config >/dev/null 2>&1; then
        return
    fi

    if ! caddy start; then
        echo "Failed to start Caddy. Ports 80/443 may already be in use."
        exit 1
    fi
}

ensure_caddy

# Register route in Caddy via Go helper and ensure cleanup on exit
cleanup() {
    go run ./cmd/mb-proxy remove --host "${OVERMIND_TITLE}.metabase.localhost" || true
}
trap cleanup EXIT

go run ./cmd/mb-proxy add \
    --host "${OVERMIND_TITLE}.metabase.localhost" \
    --frontend "${MB_FRONTEND_DEV_PORT}" \
    --backend "${MB_JETTY_PORT}"

echo "$OVERMIND_TITLE"
overmind start -D

# Wait briefly for Overmind socket before connecting
for _ in $(seq 1 50); do
    if [ -S "$OVERMIND_SOCKET" ]; then
        break
    fi
    sleep 0.1
done

overmind connect -c
