#! /usr/bin/env bash

set -euxo pipefail

# Convenience for running clj-kondo against all the appropriate directories.

find modules/drivers shared enterprise/backend \
     -maxdepth 2 \
     -type d \
     -name src -or -name test \
    | xargs clj-kondo \
            --parallel \
            --lint src test
