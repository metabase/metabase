#!/bin/bash

BASEDIR=$(dirname $0)

PROJECT_ROOT=`cd ${BASEDIR}/..; pwd`
UBERJAR_DIR="${PROJECT_ROOT}/target/uberjar"

RELEASE_TYPE="aws-eb-docker"
if [ ! -z $2 ]; then
  echo $2
fi

if [ -z $1 ]; then
  echo "Oops!  You need to specify a name for the release as an argument."
  exit 1
fi

RELEASE_FILES="${PROJECT_ROOT}/deploy/${RELEASE_TYPE}"
RELEASE_FILE="${PROJECT_ROOT}/${1}.zip"


# package up the release files
(cd $RELEASE_FILES; zip -r $RELEASE_FILE * .ebextensions)

# add the built uberjar
(cd $UBERJAR_DIR; cp metabase-*-SNAPSHOT-*.jar metabase-standalone.jar; zip $RELEASE_FILE metabase-standalone.jar)

