#!/usr/bin/env bash
# Generates the auto-derived backend docs that ship with the Astro build:
#   - docs/configuring-metabase/environment-variables.md
#   - docs/configuring-metabase/config-template.md
#   - docs/api/...                          (REST API reference)
#   - docs/installation-and-operation/commands.md
#   - docs/usage-and-performance-tools/usage-analytics.md
#
# This mirrors the generation steps in
# .github/workflows/docs-generate-base.yml, minus the branch/PR machinery —
# review the diff and commit manually.
#
# Flags (default: run everything):
#   --env-vars       Generate environment variables doc
#   --config         Generate config template doc
#   --api            Generate REST API doc
#   --commands       Generate CLI command doc
#   --analytics      Generate usage analytics doc
#
# Requires: clojure, babashka (bb).

set -euo pipefail

cd "$(dirname "$0")/.."

run_env_vars=false
run_config=false
run_api=false
run_commands=false
run_analytics=false
any_selected=false

for arg in "$@"; do
  case "$arg" in
    --env-vars)  run_env_vars=true;  any_selected=true ;;
    --config)    run_config=true;    any_selected=true ;;
    --api)       run_api=true;       any_selected=true ;;
    --commands)  run_commands=true;  any_selected=true ;;
    --analytics) run_analytics=true; any_selected=true ;;
    -h|--help)
      sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      echo "Usage: $0 [--env-vars] [--config] [--api] [--commands] [--analytics]" >&2
      exit 1
      ;;
  esac
done

if ! $any_selected; then
  run_env_vars=true
  run_config=true
  run_api=true
  run_commands=true
  run_analytics=true
fi

step() {
  echo
  echo "==> $1"
}

if $run_env_vars; then
  step "Generating environment variables documentation"
  clojure -M:ee:doc environment-variables-documentation
fi

if $run_config; then
  step "Generating config template documentation"
  clojure -M:ee:doc config-template
fi

if $run_api; then
  step "Generating REST API documentation"
  clojure -M:ee:doc api-documentation
fi

if $run_commands; then
  step "Generating CLI command documentation"
  clojure -M:ee:doc command-documentation
fi

if $run_analytics; then
  step "Generating usage analytics documentation"
  ./bin/generate-usage-analytics-docs.bb
fi

echo
echo "✓ Docs generated."
echo
echo "Review the diff under docs/ and commit alongside your code change."
