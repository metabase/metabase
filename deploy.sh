#!/bin/sh
set -x

print_usage_and_exit () {
    echo "Usage: sh deploy.sh IMAGE_VERSION"
    echo "  IMAGE_VERSION (required) can be any docker image tag"
    exit 1
}

if [ -z "$1" ] ; then
    echo 'Error: Argument IMAGE_VERSION is required in position 1.'
    print_usage_and_exit
fi

IMAGE_VERSION=${1}

# Looking up existing java versions
update-java-alternatives --list

# Switching to jdk 8
sudo update-java-alternatives --set /usr/lib/jvm/java-1.8.0-openjdk-amd64

# Checking java version
java --version
javac --version

# echo "Building metabase jar ..."
# ./bin/build
# cp target/uberjar/metabase.jar ./bin/docker/

# echo "Building docker image ..."
# cd ./bin/docker/
# docker build -t dsinnovators/metabase:${IMAGE_VERSION} .

# echo "Pushing docker image ..."
# docker push dsinnovators/metabase:${IMAGE_VERSION}
# echo "Done"
