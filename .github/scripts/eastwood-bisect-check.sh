#!/usr/bin/env bash
# `git bisect run` check for the weekly Eastwood run: lints one namespace at the checked-out commit.
#
#   git bisect run .github/scripts/eastwood-bisect-check.sh <source|tests> <namespace> <linter>
#
# Exits 1 (bad) when the linter warns in that namespace, 0 (good) when it doesn't, and 125 (skip) when Eastwood
# fails without any warning, as it does on a commit that doesn't compile. Other linters' warnings don't count:
# they belong to other findings.

set -uo pipefail

target=$1
namespace=$2
linter=$3

case "$target" in
  source) alias=":dev:ee:ee-dev:drivers:drivers-dev:test:eastwood" ;;
  tests) alias=":dev:dev/test:ee:ee-dev:drivers:drivers-dev:test:eastwood/test" ;;
  *)
    echo "Unknown target: $target" >&2
    exit 128
    ;;
esac

out=$(mktemp)
clojure -X"$alias" :namespaces "[$namespace]" :out "\"$out\""
status=$?

if grep -q "^[^ ]*:[0-9]*:[0-9]*: $linter[: ]" "$out"; then
  exit 1
elif [ "$status" -ne 0 ] && ! grep -q "^[^ ]*:[0-9]*:[0-9]*: " "$out"; then
  exit 125
fi
exit 0
