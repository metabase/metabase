#! /usr/bin/env bash

# Convenience for running clj-kondo.
#
# You can also run with specific arguments like
#
# ./bin/kondo.sh --lint src
#
# If no arguments are passed, it uses the `:kondo/all` alias which runs Kondo against all directories.


set -euo pipefail

# make sure we're in the root dir of the metabase repo i.e. the parent dir of the dir this script lives in
script_dir=`dirname "${BASH_SOURCE[0]}"`
cd "$script_dir/.."

if [ -n "${1:-}" ]; then
    command="clojure -M:kondo $@"
else
    command="clojure -M:kondo:kondo/all"
fi

# Copy over Kondo configs from libraries we use.

clojure -M:kondo --copy-configs --dependencies --lint "$(clojure -A:dev -Spath)" --skip-lint --parallel

# Clear cache and delete the broken type signatures automatically generated by Malli.

rm -rf .clj-kondo/metosin/malli-types-clj/
rm -rf .clj-kondo/.cache

# Initialize cache required for `hooks.metabase.test.data/dataset` hook.
clojure -M:kondo --dependencies --lint "test/metabase/test/data/dataset_definitions.clj"

set -x

$command
