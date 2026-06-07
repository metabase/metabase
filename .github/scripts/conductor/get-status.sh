#!/usr/bin/env bash
#
# get-status.sh — ask ci-conductor how a driver workflow should run.
#
# Queries conductor.metaba.be/api/config with the workflow name and prints the
# resulting status (skip | info | required) to $GITHUB_OUTPUT as `status=...`.
#
#   skip      the workflow should not run its tests at all
#   info      run the tests, but never fail the job (gather data only)
#   required  run the tests and fail the job on failure (the default)
#
# This is a *read* of conductor's config — it must never break CI. On a missing
# secret, an unreachable service, a non-2xx response, or an unrecognized status
# we fall back to $CI_CONDUCTOR_DEFAULT_STATUS (default "required", i.e. behave
# exactly as today). The script always exits 0; the caller gates on the printed
# status.
#
# The conductor API is still in development, so the request/response shape here
# is a best guess and intentionally easy to change:
#   GET ${CI_CONDUCTOR_API_URL}/config?workflow=<name>&repo_id=<id>&ref=<branch>&sha=<sha>
#   -> 200 {"status":"skip"|"info"|"required"}
# Authenticated with the shared x-internal-secret header, matching the existing
# ci-conductor integration in e2e/support/ci_conductor.ts.

set -uo pipefail

# Base URL for the conductor API. Defaults to production; overridable so the
# endpoint can move while it's in development.
API_URL="${CI_CONDUCTOR_API_URL:-https://conductor.metaba.be/api}"
SECRET="${CI_CONDUCTOR_WEBHOOK_SECRET:-}"
DRY_RUN="${CI_CONDUCTOR_DRY_RUN:-false}"
DEFAULT_STATUS="${CI_CONDUCTOR_DEFAULT_STATUS:-required}"

# Identifying context. These GITHUB_* vars are set automatically on every
# runner; REPO_ID / COMMIT_SHA / TARGET_BRANCH may be supplied by the caller for
# precision on pull_request events (where GITHUB_SHA is the synthetic merge sha).
WORKFLOW="${CI_CONDUCTOR_WORKFLOW:-${GITHUB_WORKFLOW:-}}"
REPO_ID="${REPO_ID:-}"
SHA="${COMMIT_SHA:-${GITHUB_SHA:-}}"
REF="${TARGET_BRANCH:-${GITHUB_REF_NAME:-}}"

log() { echo "[ci-conductor] $*"; }

emit() {
  # Print the resolved status both to the log and to the step output.
  log "status for workflow '${WORKFLOW}': $1"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "status=$1" >>"$GITHUB_OUTPUT"
  else
    # Local / test runs without a GITHUB_OUTPUT file.
    echo "status=$1"
  fi
}

valid_status() {
  [[ "$1" == "skip" || "$1" == "info" || "$1" == "required" ]]
}

if ! valid_status "$DEFAULT_STATUS"; then
  log "ignoring invalid CI_CONDUCTOR_DEFAULT_STATUS='${DEFAULT_STATUS}', using 'required'"
  DEFAULT_STATUS="required"
fi

# No secret configured (forks, local runs, secret not yet provisioned): no-op
# and behave as today.
if [[ -z "$SECRET" && "$DRY_RUN" != "true" ]]; then
  log "no CI_CONDUCTOR_WEBHOOK_SECRET set; defaulting to '${DEFAULT_STATUS}'"
  emit "$DEFAULT_STATUS"
  exit 0
fi

ENDPOINT="${API_URL%/}/config"
QUERY="workflow=$(jq -rn --arg v "$WORKFLOW" '$v|@uri')"
QUERY="${QUERY}&repo_id=$(jq -rn --arg v "$REPO_ID" '$v|@uri')"
QUERY="${QUERY}&ref=$(jq -rn --arg v "$REF" '$v|@uri')"
QUERY="${QUERY}&sha=$(jq -rn --arg v "$SHA" '$v|@uri')"
URL="${ENDPOINT}?${QUERY}"

if [[ "$DRY_RUN" == "true" ]]; then
  log "(dry run) would GET ${URL}"
  emit "$DEFAULT_STATUS"
  exit 0
fi

# -s silent, -S show errors, -f fail on HTTP >= 400, -m hard timeout. Capture
# body and HTTP code separately so we can log diagnostics on failure.
HTTP_CODE=""
BODY="$(curl -sS -m 20 -w '\n%{http_code}' \
  -H "x-internal-secret: ${SECRET}" \
  -H 'Accept: application/json' \
  "$URL" 2>/dev/null)" || {
  log "request failed (network/timeout); defaulting to '${DEFAULT_STATUS}'"
  emit "$DEFAULT_STATUS"
  exit 0
}

HTTP_CODE="$(printf '%s' "$BODY" | tail -n1)"
BODY="$(printf '%s' "$BODY" | sed '$d')"

if [[ "$HTTP_CODE" != 2* ]]; then
  log "unexpected HTTP ${HTTP_CODE}; defaulting to '${DEFAULT_STATUS}'"
  emit "$DEFAULT_STATUS"
  exit 0
fi

STATUS="$(printf '%s' "$BODY" | jq -r '.status // empty' 2>/dev/null)"

if valid_status "$STATUS"; then
  emit "$STATUS"
else
  log "response had no valid status (got '${STATUS:-<none>}'); defaulting to '${DEFAULT_STATUS}'"
  emit "$DEFAULT_STATUS"
fi

exit 0
