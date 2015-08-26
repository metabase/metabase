#!/bin/bash
set -eo pipefail

BASEDIR=$(dirname $0)
source "$BASEDIR/functions"

EB_ENVIRONMENT=metabase-proto

# create EB version
create_eb_version

# deploy EB version to environment
deploy_version ${EB_ENVIRONMENT}
