#! /usr/bin/env bash

set -eu

for file in `find resources plugins -name '*.metabase-driver.jar'`; do
    echo "Deleting $file..."
    rm "$file"
done
