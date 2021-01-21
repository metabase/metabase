#! /usr/bin/env bash

set -euo pipefail

source "./bin/check-clojure-cli.sh"
check_clojure_cli

cd bin/release
clojure -M -m release $@
