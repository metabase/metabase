#!/bin/bash
set -eo pipefail

BASEDIR=$(dirname $0)
source "$BASEDIR/functions"

create_eb_version "$1" "$2"
