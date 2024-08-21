# Reformat files that have changed since the last commit. See also `cljfmt_staged.sh` which is meant to be used as a
# commit hook

set -euo pipefail

# make sure we're in the root dir of the metabase repo i.e. the parent dir of the dir this script lives in
script_dir=`dirname "${BASH_SOURCE[0]}"`
cd "$script_dir/.."

UPDATED_FILES=$(git diff --name-only HEAD -- '*.clj' '*.cljc' '*.cljs')

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
