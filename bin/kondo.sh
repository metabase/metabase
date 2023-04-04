#! /usr/bin/env bash

set -euxo pipefail

# Convenience for running clj-kondo against all the appropriate directories.

# Copy over Kondo configs from libraries we use.

clj-kondo --copy-configs --dependencies --lint "$(clojure -A:dev -Spath)" --skip-lint --parallel

rm -rf .clj-kondo/metosin/malli-types-clj/
rm -rf .clj-kondo/.cache

# Run Kondo against all of our Clojure files in the various directories they might live.
find modules/drivers shared enterprise/backend \
     -maxdepth 2 \
     -type d \
     -name src -or -name test \
    | xargs clj-kondo \
            --parallel \
            --lint src test
