#! /usr/bin/env bash

# Do whitespace linting on staged files OR all files if --all is passed.
# If neither of the above are true, will report what needs to happen and do nothing else.
# Returns an error when a file is not properly formatted, which will prevent a git commit if a hook is used.

set -euo pipefail

# List only new and modified files (not deleted)
STAGED_FILES=$(git diff --name-status --cached -- "*.clj" "*.cljc" "*.cljs" "*.edn" | grep -E '[AM]' | cut -f2 || true)

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
