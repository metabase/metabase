#!/bin/bash
set -eo pipefail

BASEDIR=$(dirname $0)
source "$BASEDIR/functions"

build_uberjar
mk_release_artifacts "$1"
