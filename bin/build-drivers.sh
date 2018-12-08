#! /usr/bin/env bash

set -eu

for driver in `ls modules/drivers/ | perl -pe 's|/$||'`; do # strip trailing slashed if ls is set to include them
    ./bin/build-driver.sh "$driver"
done
