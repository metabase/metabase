#! /usr/bin/env bash

set -euo pipefail

script_dir=`dirname "${BASH_SOURCE[0]}"`
cd "$script_dir/.."
root=

./bin/pre-lint-migrations-file.sh

cd bin/lint-migrations-file
clojure -M -m lint-migrations-file $@
