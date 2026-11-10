#!/usr/bin/env bash

set -euo pipefail

function pom() {
    path=$1
    echo "Writing ${path}/pom.xml"
    (cd "$path" && clojure -X:deps mvn-pom)
}

pom .

for dir in modules/drivers/*; do
    test -d "$dir" && pom "$dir"
done
