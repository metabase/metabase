#!/bin/bash

BASEDIR=$(dirname $0)
source "$BASEDIR/functions"

# deploy EB version to environment
deploy_version "$1" "$2"
