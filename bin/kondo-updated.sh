#! /usr/bin/env bash

# Run Kondo against files that have changed since the last commit. See also `cljfmt.sh`
#
# By default, lints uncommitted changes i.e. files that are different compared to HEAD. You can choose a different
# target to diff against e.g. `master` as follows:
#
#    ./bin/cljfmt.sh master

set -euo pipefail

# make sure we're in the root dir of the metabase repo i.e. the parent dir of the dir this script lives in
script_dir=`dirname "${BASH_SOURCE[0]}"`
cd "$script_dir/.."

if [ -n "${1:-}" ]; then
    diff_target="$1"
else
    diff_target="HEAD"
fi

echo "Linting Clojure source files that have changes compared to $diff_target..."

UPDATED_FILES=$(git diff --name-only "$diff_target" -- '*.clj' '*.cljc' '*.cljs')

if [ -z "$UPDATED_FILES" ]; then
    echo 'No updated Clojure source files.'
    exit 0
fi

command="clj-kondo --parallel --lint ${UPDATED_FILES[*]}"

set -x

$command
