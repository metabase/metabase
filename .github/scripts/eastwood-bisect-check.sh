#!/usr/bin/env bash
# `git bisect run` check for the weekly Eastwood run: lints one namespace at the checked-out commit.
#
#   git bisect run eastwood-bisect-check.sh <source|tests> <namespace> <linter> [<baseline.txt>]
#
# The baseline is the previous weekly run's warnings.
# Exits 1 (bad) when the linter gives a warning in that namespace that isn't in the baseline.
# So a namespace that was already failing still bisects to the commit that made it worse.
# Exits 0 (good) when there is no such warning.
# Exits 125 (skip) when Eastwood fails without any warning, as it does on a commit that doesn't compile.
# Other linters' warnings don't count: they belong to other findings.

set -uo pipefail

target=$1
namespace=$2
linter=$3
baseline=${4:-/dev/null}

case "$target" in
  source) alias=":dev:ee:ee-dev:drivers:drivers-dev:test:eastwood" ;;
  tests) alias=":dev:dev/test:ee:ee-dev:drivers:drivers-dev:test:eastwood/test" ;;
  *)
    echo "Unknown target: $target" >&2
    # Above 127 stops the bisect, instead of marking the commit bad.
    exit 128
    ;;
esac

# The warnings from this linter, without line and column, sorted for `comm`.
# The report script builds the same keys to match findings across runs.
keys() {
  sed -E 's/^([^:]+):[0-9]+:[0-9]+: /\1: /' "$1" | grep -E "^[^ ]+: $linter[: ]" | sort
}

out=$(mktemp)
clojure -X"$alias" :namespaces "[$namespace]" :out "\"$out\"" < /dev/null
status=$?

if [ -n "$(comm -23 <(keys "$out") <(keys "$baseline"))" ]; then
  exit 1
elif [ "$status" -ne 0 ] && ! grep -qE "^[^ ]+:[0-9]+:[0-9]+: " "$out"; then
  exit 125
fi
exit 0
