#!/bin/bash

BASEDIR=$(dirname $0)
CURRENTDIR=$PWD

S3_BUCKET=downloads.metabase.com


# parse any cmd line arguments
while [[ $# > 0 ]]
do
key="$1"

case $key in
    --publish)
    PUBLISH=YES
    ;;
    *)
        # unknown option
    ;;
esac

shift # past argument or value
done


if [ "$PUBLISH" == "YES" ] && [ -z "$AWS_DEFAULT_PROFILE" ]; then
    echo "In order to publish an Elastic Beanstalk version to S3 you must set the AWS_DEFAULT_PROFILE environment variable"
    exit 1
fi

# we need to know the tag of the current repo, and if we can't get a tag then bail
MB_TAG=`${BASEDIR}/../current_tag.sh`
if [ $? -eq 1 ]; then
    echo "Failed to get current tag from git.  Make sure you are on a tagged commit!"
    exit 1
fi

EB_FILE=metabase-aws-eb.zip
S3_FILE=s3://${S3_BUCKET}/${MB_TAG}/${EB_FILE}


echo "Building Elastic Beanstalk app version from Metabase ${MB_TAG}"

# dynamically insert our MB version into the EB config file
sed "s/@@MB_TAG@@/${MB_TAG}/" < ${BASEDIR}/Dockerrun.aws.json.template > ${BASEDIR}/Dockerrun.aws.json

# create our EB zip file
cd $BASEDIR; zip -r ${EB_FILE} .ebextensions Dockerrun.aws.json; cd $CURRENTDIR

# clean up the temporary Dockerrun.aws.json file we created
rm ${BASEDIR}/Dockerrun.aws.json


if [ "$PUBLISH" == "YES" ]; then
    echo "Publishing EB file to S3 at ${S3_FILE}"

    # s3 put
    aws s3 cp ${BASEDIR}/${EB_FILE} ${S3_FILE}

    # TODO: quick check to see that we succeeded

fi


echo "Done"
