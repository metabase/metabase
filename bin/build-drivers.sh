#! /usr/bin/env bash

set -eu

if [ "$1" == clean ]; then
    rm -rf ~/.m2/repository/metabase-core
    rm -rf ~/.m2/repository/metabase/*-driver

    rm -rf resources/modules
    rm -rf target
    find modules -name target -type d -exec rm -rf {} \;
fi

for driver in `ls modules/drivers/ | perl -pe 's|/$||'`; do # strip trailing slashed if ls is set to include them
    ./bin/build-driver.sh "$driver"
done
