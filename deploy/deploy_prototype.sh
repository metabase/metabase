#!/bin/bash

BASEDIR=$(dirname $0)

if [ -z $1 ]; then
  echo "Oops!  You need to specify the name of the EB app version to deploy."
  exit 1
fi

APP_BUNDLE=$1
ENVIRONMENT=metabase-proto


# deploy EB version to environment
${BASEDIR}/deploy_version.sh ${APP_BUNDLE} ${ENVIRONMENT}
