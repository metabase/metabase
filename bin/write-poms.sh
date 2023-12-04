#!/usr/bin/env bash

set -euo pipefail

function pom() {
    path=$1
    echo "Writing ${path}/pom.xml"
    (cd "$path" && clj -X:deps mvn-pom)
}

pom .

for k in $(ls modules/drivers/); do
    test -d "modules/drivers/$k" && pom "modules/drivers/$k"
done
