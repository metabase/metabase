#!/bin/bash

BASEDIR=$(dirname $0)
source "$BASEDIR/functions"

if [ -z $1 ]; then
  echo "Oops!  You need to specify the name of the EB app version to deploy."
  exit 1
fi

EB_VERSION_LABEL=$1
EB_ENVIRONMENT=metabase-proto

# deploy EB version to environment
deploy_version ${EB_ENVIRONMENT} ${EB_VERSION_LABEL}
