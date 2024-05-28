#! /usr/bin/env bash

# Do whitespace linting on passed in files.
# This is intended to be called from a commit hook (see package.json > lint-staged) that passes in staged changes

set -euo pipefail

STAGED_FILES="$@"

if [ "${#STAGED_FILES}" -gt 0 ]; then
  args=()
  for file in $STAGED_FILES; do
    args+=("\"$file\"")
  done
  echo checking formatting for $STAGED_FILES

  clojure -T:whitespace-linter lint "{:paths [${args[*]}]}"
else
  echo "No staged clj, cljc, cljs, or edn files to whitespace lint."
fi
