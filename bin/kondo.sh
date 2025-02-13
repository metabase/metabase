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
    init_cache="false"
    command="clojure -M:kondo $@"
else
    init_cache="true"
    command="clojure -M:kondo:kondo/all"
fi

# Copy over Kondo configs from libraries we use.

DEPS_EDN_CHECKSUM_FILE=".clj-kondo/.deps.edn.md5sum"

if [ -f $DEPS_EDN_CHECKSUM_FILE ]; then
    previous_deps_edn_checksum=$(cat $DEPS_EDN_CHECKSUM_FILE)
else
    previous_deps_edn_checksum=""
fi

current_deps_edn_checksum=$(md5sum deps.edn)

if [ "$previous_deps_edn_checksum" != "$current_deps_edn_checksum" ]; then
    clojure -M:kondo --copy-configs --dependencies --lint "$(clojure -A:dev -Spath)" --skip-lint --parallel
    echo "$current_deps_edn_checksum" > $DEPS_EDN_CHECKSUM_FILE
fi

# Clear cache and delete the broken type signatures automatically generated by Malli.
#
# TODO -- it's only really important to clear the cache when we switch branches; maybe we can keep track of what
# branch we last ran on and only clear the cache when it changes.

rm -rf .clj-kondo/metosin/malli-types-clj/
rm -rf .clj-kondo/.cache

# Initialize cache required for `hooks.metabase.test.data/dataset` hook. Only when running the full set of things
if [ "$init_cache" = "true" ]; then
    clojure -M:kondo --dependencies --lint "test/metabase/test/data/dataset_definitions.clj"
fi

set -x

$command
