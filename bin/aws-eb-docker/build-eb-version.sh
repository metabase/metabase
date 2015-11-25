#!/bin/bash

BASEDIR=$(dirname $0)
source "$BASEDIR/functions"

MB_TAG=$1
if [ -z $MB_TAG ]; then
    echo "usage: $0 <release-name> <docker-repository>"
    exit 1
fi

MB_DOCKER_REPOSITORY=$2
if [ -z $MB_DOCKER_REPOSITORY ]; then
    echo "usage: $0 <release-name> <docker-repository>"
    exit 1
fi


make_eb_version ${MB_TAG} ${MB_DOCKER_REPOSITORY}
