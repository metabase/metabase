#! /usr/bin/env bash

# Reformat only staged files OR all files if --all is passed.
# If neither of the above are true, will report what needs to happen and do nothing else.

set -euo pipefail

ARG=${1:-}

STAGED_FILES=$(git diff --name-only --cached -- "*.clj" "*.cljc" "*.cljs")

if [ "$ARG" == "--all" ]; then
  clojure -T:whitespace-linter lint
elif [ "${#STAGED_FILES}" -gt 0 ]; then
  clojure -T:whitespace-linter lint :paths $STAGED_FILES
else
  echo "No files to whitespace lint. Either pass --all to format all files or stage files."
fi
