#! /usr/bin/env bash

set -uo pipefail

source "./bin/check-clojure-cli.sh"
check_clojure_cli

cd bin/build-drivers
clojure -M -m build-drivers
