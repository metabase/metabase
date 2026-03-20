#!/bin/bash
# Read-only tmux pane capture for sandbox use.
# Only allows capture-pane (read), blocks send-keys and other write operations.
# Usage: capture-pane.sh <pane-index> [lines]
set -euo pipefail

PANE="${1:?Usage: capture-pane.sh <pane-index> [lines]}"
LINES="${2:-200}"

# Validate pane is a number
if ! [[ "$PANE" =~ ^[0-9]+$ ]]; then
  echo "Error: pane must be a number" >&2
  exit 1
fi

tmux capture-pane -t "$PANE" -p -S "-${LINES}"
