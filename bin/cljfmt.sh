#! /usr/bin/env bash

set -euxo pipefail

ARG=${1:-}

STAGED_FILES=$(git diff --name-only --cached -- "*.clj" "*.cljc" "*.cljs")

if [ "$ARG" == "--all" ]; then
  clojure -M:cljfmt \
    --indents ./.cljfmt/indents.clj
elif [ "${#STAGED_FILES}" -gt 0 ]; then
  clojure -M:cljfmt \
    --indents ./.cljfmt/indents.clj \
    $STAGED_FILES
else
  echo "No input. Either pass --all to format all files or stage files to be formatted."
fi