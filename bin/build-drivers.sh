#! /usr/bin/env bash

set -eo pipefail

# If ran as `./bin/build-drivers.sh clean` then uninstall metabase-core from the local Maven repo and delete
if [ "$1" == clean ]; then
    echo "Deleting existing installed metabase-core and driver dependencies..."
    rm -rf ~/.m2/repository/metabase-core
    rm -rf ~/.m2/repository/metabase/*-driver

    echo "Deleting built drivers in resources/modules..."
    rm -rf resources/modules
    echo "Deleting build Metabase uberjar..."
    rm -rf target

    for target in `find modules -name 'target' -type d`; do
        echo "Deleting $target..."
        rm -rf "$target"
    done
fi

for driver in `ls modules/drivers/ | sed 's|/$||'`; do # strip trailing slashes if `ls` is set to include them
    echo "Build: $driver"
    ./bin/build-driver.sh "$driver"

    if [ $? -ne 0 ]; then
        echo "Failed to build driver $driver."
        exit -1
    fi
done
