#! /usr/bin/env bash

set -eo pipefail

driver="$1"

if [ ! "$driver" ]; then
    echo "Usage: ./bin/build-driver.sh <driver> [:edition edition]"
    exit -1
fi

# switch to project root directory if we're not already there
script_directory=`dirname "${BASH_SOURCE[0]}"`
cd "$script_directory/.."

source "./bin/check-clojure-cli.sh"
check_clojure_cli

source "./bin/clear-outdated-cpcaches.sh"
clear_outdated_cpcaches

clojure -X:build:drivers:build/driver :driver $@
