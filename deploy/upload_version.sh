#!/bin/bash

if [ -z $1 ]; then
  echo "Oops!  You need to specify the name of the EB zip file to upload."
  exit 1
fi

APP_BUNDLE=$1

UUID=$(cat /dev/urandom | env LC_CTYPE=C tr -dc 'a-zA-Z0-9' | fold -w 16 | head -n 1)
S3_KEY="${UUID}_${APP_BUNDLE}.zip"

S3_BUCKET=elasticbeanstalk-us-east-1-867555200881
APPLICATION=Metabase


# upload bundle to s3
echo "Uploading app version to S3"
aws s3api put-object --bucket ${S3_BUCKET} --key ${S3_KEY} --body ${APP_BUNDLE}.zip

# create EB version
echo "Creating app version in EB"
aws elasticbeanstalk create-application-version --no-auto-create-application --region us-east-1 --application-name ${APPLICATION} --version-label ${APP_BUNDLE} --source-bundle S3Bucket="${S3_BUCKET}",S3Key="${S3_KEY}"

