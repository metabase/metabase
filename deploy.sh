#!/bin/sh
set -x

print_usage_and_exit () {
    echo "Usage: sh deploy.sh IMAGE_VERSION"
    echo "  IMAGE_VERSION (required) can be any docker image tag"
    echo '  Following variables should be set as part environment variables:'
    echo "    - REPO_USERNAME"
    echo "    - REPO_PASSWORD"
    exit 1
}

if [ -z "$1" ] || { [ $1 != 'no' ] && [ $1 != 'yes' ] ;} ; then
    echo 'Error: Argument IMAGE_VERSION is required in position 1.'
    print_usage_and_exit
fi
if [ -z "$REPO_USERNAME" ] ; then
   echo 'Error: REPO_USERNAME is not found as environment variable.'
   print_usage_and_exit
fi
if [ -z "$REPO_PASSWORD" ] ; then
   echo 'Error: REPO_PASSWORD is not found as environment variable.'
   print_usage_and_exit
fi

IMAGE_VERSION=${1}

echo "Building metabase jar ..."
./bin/build
cp target/uberjar/metabase.jar ./bin/docker/

echo "Building docker image ..."
cd ./bin/docker/
docker build -t dsinnovators/metabase:${IMAGE_VERSION} .

echo "Pushing docker image ..."
docker logout
docker login -u ${REPO_USERNAME} -p ${REPO_PASSWORD}
docker push dsinnovators/metabase:${IMAGE_VERSION}
echo "Done"