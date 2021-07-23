#! /usr/bin/env bash

set -euo pipefail

# switch to project root directory if we're not already there
script_directory=`dirname "${BASH_SOURCE[0]}"`
cd "$script_directory/.."

source "./bin/check-clojure-cli.sh"
check_clojure_cli

source "./bin/prep.sh"
prep_deps

cd bin/build-drivers
clojure -M -m build-drivers $@
