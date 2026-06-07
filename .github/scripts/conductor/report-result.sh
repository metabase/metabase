#!/usr/bin/env bash
#
# report-result.sh — tell ci-conductor how a driver workflow turned out.
#
# Called at the end of a driver workflow to POST the run's outcome back to
# conductor.metaba.be/api/config, so conductor can track per-workflow
# pass/fail/flake history and drive future skip/info/required decisions.
#
# Inputs (via env):
#   CI_CONDUCTOR_STATUS   the status the job ran under (skip|info|required)
#   CI_CONDUCTOR_OUTCOME  the test outcome (success|failure|cancelled|skipped)
#
# Best-effort and non-fatal, exactly like the e2e reporter
# (e2e/support/ci_conductor.ts): a reporting problem must never change a job's
# result. No-ops when no secret is configured. Always exits 0.
#
# The conductor API is still in development; the shape below is a best guess:
#   POST ${CI_CONDUCTOR_API_URL}/config
#   { workflow, repo_id, run_id, run_attempt, job, sha, ref, status, outcome }

set -uo pipefail

API_URL="${CI_CONDUCTOR_API_URL:-https://conductor.metaba.be/api}"
SECRET="${CI_CONDUCTOR_WEBHOOK_SECRET:-}"
DRY_RUN="${CI_CONDUCTOR_DRY_RUN:-false}"

WORKFLOW="${CI_CONDUCTOR_WORKFLOW:-${GITHUB_WORKFLOW:-}}"
JOB="${GITHUB_JOB:-}"
RUN_ID="${GITHUB_RUN_ID:-}"
RUN_ATTEMPT="${GITHUB_RUN_ATTEMPT:-}"
REPO_ID="${REPO_ID:-}"
SHA="${COMMIT_SHA:-${GITHUB_SHA:-}}"
REF="${TARGET_BRANCH:-${GITHUB_REF_NAME:-}}"
STATUS="${CI_CONDUCTOR_STATUS:-}"
OUTCOME="${CI_CONDUCTOR_OUTCOME:-}"

log() { echo "[ci-conductor] $*"; }

# Build the payload with jq so values are escaped correctly. Numeric fields are
# coerced from strings (empty -> null).
num() { if [[ -n "${1:-}" ]]; then echo "$1"; else echo "null"; fi; }

BODY="$(jq -nc \
  --arg workflow "$WORKFLOW" \
  --arg job "$JOB" \
  --argjson run_id "$(num "$RUN_ID")" \
  --argjson run_attempt "$(num "$RUN_ATTEMPT")" \
  --argjson repo_id "$(num "$REPO_ID")" \
  --arg sha "$SHA" \
  --arg ref "$REF" \
  --arg status "$STATUS" \
  --arg outcome "$OUTCOME" \
  '{workflow:$workflow, job:$job, run_id:$run_id, run_attempt:$run_attempt,
    repo_id:$repo_id, sha:$sha, ref:$ref, status:$status, outcome:$outcome}')"

if [[ "$DRY_RUN" == "true" ]]; then
  log "(dry run) would POST result: ${BODY}"
  exit 0
fi

if [[ -z "$SECRET" ]]; then
  log "no CI_CONDUCTOR_WEBHOOK_SECRET set; not reporting result"
  exit 0
fi

ENDPOINT="${API_URL%/}/config"

HTTP_CODE="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' \
  -X POST \
  -H "x-internal-secret: ${SECRET}" \
  -H 'Content-Type: application/json' \
  -d "$BODY" \
  "$ENDPOINT" 2>/dev/null)" || {
  log "result POST failed (network/timeout); ignoring"
  exit 0
}

if [[ "$HTTP_CODE" == 2* ]]; then
  log "reported outcome '${OUTCOME}' (ran as '${STATUS}') -> HTTP ${HTTP_CODE}"
else
  log "result POST returned HTTP ${HTTP_CODE}; ignoring"
fi

exit 0
