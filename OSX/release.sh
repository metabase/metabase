#! /usr/bin/env bash

set -euo pipefail

script_directory=`dirname "${BASH_SOURCE[0]}"`
cd "$script_directory"

source "../bin/check-clojure-cli.sh"
check_clojure_cli

clojure -M -m macos-release $@
