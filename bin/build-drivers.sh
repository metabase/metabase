#! /usr/bin/env bash

set -e

if [ "$1" == clean ]; then
    rm -rf ~/.m2/repository/metabase-core
    rm -rf ~/.m2/repository/metabase/*-driver

    rm -rf resources/modules
    rm -rf target

    for target in `find modules -name target -type d`; do
        rm -rf "$target"
    done
fi

for driver in `ls modules/drivers/ | perl -pe 's|/$||'`; do # strip trailing slashed if ls is set to include them
    ./bin/build-driver.sh "$driver"
done
