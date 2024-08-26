#! /usr/bin/env bash

# Reformat files that have changed since the last commit. See also `cljfmt_staged.sh` which is meant to be used as a
# commit hook, or `kondo-updated.sh` for doing the same thing
#
# By default, reformats uncommitted changes i.e. files that are different compared to HEAD. You can choose a different
# target to diff against e.g. `master` as follows:
#
#    ./bin/cljfmt-updated.sh master

set -euo pipefail

# make sure we're in the root dir of the metabase repo i.e. the parent dir of the dir this script lives in
script_dir=`dirname "${BASH_SOURCE[0]}"`
cd "$script_dir/.."

if [ -n "${1:-}" ]; then
    diff_target="$1"
else
    diff_target="HEAD"
fi

echo "Formatting Clojure source files that have changes compared to $diff_target..."

UPDATED_FILES=$(git diff --name-only "$diff_target" -- '*.clj' '*.cljc' '*.cljs')

if [ -z "$UPDATED_FILES" ]; then
    echo 'No updated Clojure source files.'
    exit 0
fi

args=()
for file in $UPDATED_FILES; do
  args+=("\"$file\"")
done

set -x

clojure -T:cljfmt fix "{:paths [${args[*]}]}"
