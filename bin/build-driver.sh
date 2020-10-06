#! /usr/bin/env bash

set -eo pipefail

driver="$1"

if [ ! "$driver" ]; then
    echo "Usage: ./bin/build-driver.sh [driver]"
    exit -1
fi

if [ ! `which clojure` ]; then
    echo "Please install the Clojure command line tools. See https://www.clojure.org/guides/getting_started for instructions."
    exit -2
fi

cd bin/build-drivers

clojure -m build-driver "$1"
