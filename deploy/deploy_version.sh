#!/bin/bash

BASEDIR=$(dirname $0)

if [ -z $1 ]; then
  echo "usage: deploy_version.sh <version> <environment>"
  exit 1
fi

if [ -z $2 ]; then
  echo "usage: deploy_version.sh <version> <environment>"
  exit 1
fi

APP_BUNDLE=$1
ENVIRONMENT=$2


# upload app version to EB
# TODO: check if version already exists
${BASEDIR}/upload_version.sh ${APP_BUNDLE}

# deploy EB version to environment
aws elasticbeanstalk update-environment --region us-east-1 --environment-name ${ENVIRONMENT} --version-label ${APP_BUNDLE}
