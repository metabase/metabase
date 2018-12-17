#! /usr/bin/env bash

set -e

if [ "$1" == clean ]; then
    rm -rf ~/.m2/repository/metabase-core
    rm -rf ~/.m2/repository/metabase/*-driver

    rm -rf resources/modules
    rm -rf target
    rm -rf ./uberjar-blacklist.txt

    for target in `find modules -name target -type d`; do
        rm -rf "$target"
    done
fi

# Build the Google driver first since multiple drivers have it as a dep...
# This will also ensure Metabase is installed locally & blacklist is generated if needed before running everything else in parallel
./bin/build-driver.sh google

for driver in `ls modules/drivers/ | perl -pe 's|/$||'`; do # strip trailing slashed if ls is set to include them
    ./bin/build-driver.sh "$driver" &
done

wait
