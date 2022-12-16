#! /usr/bin/env bash

# Convenience/CI script for running clj-kondo against all source and test directories using Docker

set -ex

docker run --rm --volume $PWD:/work --workdir /work cljkondo/clj-kondo:2022.08.03 \
    clj-kondo --config .clj-kondo/config.edn --config-dir .clj-kondo \
    --parallel --lint src test \
    $(find shared modules/drivers enterprise/backend -maxdepth 2 -type d \( -name src -o -name test \))
