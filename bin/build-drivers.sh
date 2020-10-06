#! /usr/bin/env bash

set -euo pipefail

if [ ! `which clojure` ]; then
    echo "Please install the Clojure command line tools. See https://www.clojure.org/guides/getting_started for instructions."
    exit -2
fi

cd bin/build-drivers

clojure -m build-drivers
