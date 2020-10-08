#! /usr/bin/env bash

set -eo pipefail

driver="$1"

if [ ! "$driver" ]; then
    echo "Usage: ./bin/build-driver.sh [driver]"
    exit -1
fi

source "./bin/check-clojure-cli.sh"
check_clojure_cli

cd bin/build-drivers
clojure -M -m build-driver "$driver"
