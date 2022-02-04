#! /usr/bin/env bash

set -eo pipefail

driver="$1"

if [ ! "$driver" ]; then
    echo "Usage: ./bin/build-driver.sh <driver> [edition]"
    exit -1
fi

# switch to project root directory if we're not already there
script_directory=`dirname "${BASH_SOURCE[0]}"`
cd "$script_directory/.."

source "./bin/check-clojure-cli.sh"
check_clojure_cli

source "./bin/clear-outdated-cpcaches.sh"
clear_outdated_cpcaches

source "./bin/prep.sh"
prep_deps

cd bin/build-drivers
clojure -M -m build-driver $@
