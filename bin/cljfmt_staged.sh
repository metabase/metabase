#! /usr/bin/env bash

# Reformat staged clj, cljc, and cljs files
# Will print the results of the call. Will return an error (stopping the commit stage) if any files are reformatted.
#
# This is not a custom reformatter.
# In the event that do you want to do some manual reformatting, you can do this:
# clojure -T:cljfmt fix ;; Reformat everything

set -euo pipefail

echo "This script is deprecated. Please use mage instead."
echo "see:"
echo "./bin/mage"

STAGED_FILES=$(git diff --name-status --cached -- "*.clj" "*.cljc" "*.cljs" | grep -E '[AM]' | cut -f2 || true)

if [ "${#STAGED_FILES}" -gt 0 ]; then
  args=()
  for file in $STAGED_FILES; do
    args+=("\"$file\"")
  done

  output=$(clojure -T:cljfmt fix "{:paths [${args[*]}]}" 2>&1)

  if [ -n "$output" ]; then
    echo $output
  else
    echo "All staged clj, cljc, or cljs formatted correctly"
  fi
else
  echo "No staged clj, cljc, or cljs files to format"
fi
