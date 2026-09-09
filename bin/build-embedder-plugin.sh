#! /usr/bin/env bash

set -eo pipefail

script_directory=`dirname "${BASH_SOURCE[0]}"`
cd "$script_directory/.."

source "./bin/check-clojure-cli.sh"
check_clojure_cli

source "./bin/clear-outdated-cpcaches.sh"
clear_outdated_cpcaches

clojure -X:build:build/embedder-plugin "$@"
