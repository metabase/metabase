#!/bin/bash

BASEDIR=$(dirname $0)
source "$BASEDIR/functions"

MB_TAG=$1
if [ -z $MB_TAG ]; then
    echo "usage: $0 <release-name> <docker-repository> <eb-environment>"
    exit 1
fi

MB_DOCKER_REPOSITORY=$2
if [ -z $MB_DOCKER_REPOSITORY ]; then
    echo "usage: $0 <release-name> <docker-repository> <eb-environment>"
    exit 1
fi

EB_ENVIRONMENT=$3
if [ -z $EB_ENVIRONMENT ]; then
    echo "usage: $0 <release-name> <docker-repository> <eb-environment>"
    exit 1
fi

if [ -z "$AWS_DEFAULT_PROFILE" ]; then
    echo "You must set the AWS_DEFAULT_PROFILE environment variable in order to deploy to AWS!"
    exit 1
fi


make_eb_version ${MB_TAG} ${MB_DOCKER_REPOSITORY}
upload_eb_version ${MB_TAG}
create_eb_version ${MB_TAG}
deploy_version ${MB_TAG} ${EB_ENVIRONMENT}
