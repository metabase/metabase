#!/bin/bash

BASEDIR=$(dirname $0)
CURRENTDIR=$PWD

DOCKERHUB_REPO=metabase
S3_BUCKET=downloads.metabase.com


# parse any cmd line arguments
MB_TAG=$1
if [ -z $MB_TAG ]; then
    echo "usage: $0 <release-name> [--publish]"
    exit 1
fi

if [ -z "$AWS_DEFAULT_PROFILE" ]; then
    echo "In order to publish an Elastic Beanstalk version to S3 you must set the AWS_DEFAULT_PROFILE environment variable"
    exit 1
fi

# TODO: improve this (hard coding)
EB_FILE=/tmp/${MB_TAG}.zip
EB_LAUNCH_FILE=launch-aws-eb.html
S3_FILE=s3://${S3_BUCKET}/${MB_TAG}/metabase-aws-eb.zip
S3_LAUNCH_FILE=s3://${S3_BUCKET}/${MB_TAG}/${EB_LAUNCH_FILE}

# make the release file
${BASEDIR}/build-eb-version.sh ${MB_TAG} ${DOCKERHUB_REPO}

# dynamically insert our MB version into the EB launch file
sed "s/@@MB_TAG@@/${MB_TAG}/" < ${BASEDIR}/${EB_LAUNCH_FILE}.template > ${BASEDIR}/${EB_LAUNCH_FILE}


echo "Publishing EB files to S3 at ${S3_FILE} and ${S3_LAUNCH_FILE}"

# s3 put
aws s3 cp ${EB_FILE} ${S3_FILE}
aws s3 cp ${BASEDIR}/${EB_LAUNCH_FILE} ${S3_LAUNCH_FILE}

# TODO: quick check to see that we succeeded

# clean up the temporary EB launch file we created
rm ${BASEDIR}/${EB_LAUNCH_FILE}

echo "Done"
