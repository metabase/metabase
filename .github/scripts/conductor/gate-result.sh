#!/usr/bin/env bash
#
# gate-result.sh — the per-driver required status check.
#
# Each driver-*.yml workflow ends with a `result` job that runs this. It decides
# the workflow's overall pass/fail from the decide + test job results and the
# conductor status, implementing the skip/info/required contract:
#
#   - decide must have succeeded (the gate itself must be healthy)
#   - conductor status "info"  => always pass (just log what really happened)
#   - otherwise                 => pass iff the test job succeeded or was skipped
#
# Inputs (via env):
#   DECIDE_RESULT     result of the decide job   (success|failure|cancelled|skipped)
#   TEST_RESULTS      space-separated results of this workflow's test job(s)
#                     (e.g. "success", or "success skipped" for multi-job files)
#   CONDUCTOR_STATUS  skip|info|required          (may be empty if decide failed)

set -uo pipefail

DECIDE_RESULT="${DECIDE_RESULT:-}"
TEST_RESULTS="${TEST_RESULTS:-}"
CONDUCTOR_STATUS="${CONDUCTOR_STATUS:-}"

echo "decide=${DECIDE_RESULT} test=[${TEST_RESULTS}] conductor=${CONDUCTOR_STATUS:-<none>}"

# The decision gate must be healthy. If mage/conductor lookups failed, fail
# closed rather than silently passing untested code.
if [[ "$DECIDE_RESULT" != "success" ]]; then
  echo "::error::Driver decision job did not succeed (${DECIDE_RESULT}); failing closed."
  exit 1
fi

# "info": run for data only — never block, regardless of outcome.
if [[ "$CONDUCTOR_STATUS" == "info" ]]; then
  echo "Conductor status is 'info' — auto-passing (test results were: [${TEST_RESULTS}])."
  exit 0
fi

# skip / required: a skipped test job (driver not selected, or conductor skip)
# passes; a successful one passes; anything else fails. Every test job in the
# workflow must clear this bar.
for r in $TEST_RESULTS; do
  case "$r" in
    success|skipped) ;;
    *)
      echo "::error::Driver tests did not pass (a test job result was: ${r})."
      exit 1
      ;;
  esac
done

echo "Driver tests passed (or were skipped)."
exit 0
