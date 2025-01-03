#!/usr/bin/env bash

# Convenience script for building the Uberjar. This is just an entrypoint into the code in `bin/build/src/build.clj`.
#
# Options are passed directly to Clojure with `-X` semantics.
#
#    # Build only the frontend
#    ./bin/build.sh '{:steps [:frontend]}'
#
#    # Build EE version
#    ./bin/build.sh '{:edition :ee}'
#
# You can also specify EE vs OSS by setting the `MB_EDITION` env var.

set -euo pipefail

# switch to project root directory if we're not already there
script_directory=`dirname "${BASH_SOURCE[0]}"`
cd "$script_directory/.."

source "./bin/check-clojure-cli.sh"
check_clojure_cli

source "./bin/clear-outdated-cpcaches.sh"
clear_outdated_cpcaches

clojure -X:drivers:build:build/all "$@"
