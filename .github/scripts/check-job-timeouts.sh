#!/usr/bin/env bash
# Fails when a job in .github/workflows/ does not set `timeout-minutes`.
#
# Without it a job inherits GitHub's 6-hour default, so a hung job burns six hours of runner time -
# and holds up everything queued behind it - before anyone notices. actionlint cannot check this: its
# rule set is compiled in and .github/actionlint.yaml only takes `self-hosted-runner`,
# `config-variables`, and `paths` (which suppresses findings rather than adding them). Hence this
# script.
#
# The rule is per job: a `timeout-minutes` on a step does not satisfy it, and steps are not required
# to carry one of their own.
#
# Jobs that call a reusable workflow (`uses:` at the job level) are skipped - GitHub rejects
# `timeout-minutes` there. The called workflow's own jobs are checked when it lives in this repo.
#
#   .github/scripts/check-job-timeouts.sh [workflow-file ...]
#
# With no arguments it checks every workflow; CI passes the files that changed, like actionlint does.

set -euo pipefail

# Arguments are used as given, so the paths in the annotations match what the caller passed. Without
# them the full scan has to run from the repo root.
if [ $# -gt 0 ]; then
  workflows=("$@")
else
  cd "$(git rev-parse --show-toplevel)"

  shopt -s nullglob
  workflows=(.github/workflows/*.yml .github/workflows/*.yaml)

  if [ ${#workflows[@]} -eq 0 ]; then
    echo "::error::check-job-timeouts.sh: no workflow files found under .github/workflows/" >&2
    exit 1
  fi
fi

status=0

for file in "${workflows[@]}"; do
  # `awk NF` drops the blank line yq emits when a file has nothing to report.
  missing="$(
    # --header-preprocess=false: yq otherwise slurps any leading comment block before parsing, which
    # shifts every line number it reports by the size of that block.
    yq --header-preprocess=false '
      .jobs
      | to_entries
      | .[]
      | select(((.value | has("timeout-minutes")) or (.value | has("uses"))) | not)
      | [(.key | line), .key]
      | @tsv
    ' "$file" | awk NF
  )"

  [ -n "$missing" ] || continue

  while IFS=$'\t' read -r line job; do
    echo "::error file=${file},line=${line}::Job \"${job}\" does not set a job-level timeout-minutes" >&2
  done <<< "$missing"

  status=1
done

if [ "$status" -ne 0 ]; then
  echo >&2
  echo "Every job must set an explicit timeout-minutes; without one it inherits GitHub's 6-hour default." >&2
  echo "Pick a value with headroom over the job's normal runtime." >&2
  exit 1
fi

echo "All jobs in the ${#workflows[@]} workflow file(s) checked set timeout-minutes."
