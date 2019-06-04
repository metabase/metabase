#! /usr/bin/env bash

set -e

BASEDIR=$(dirname $0)
PROJECT_ROOT="$BASEDIR/../.."

DOCKERHUB_NAMESPACE=metabase


BUILD_TYPE=$1
if [ -z $BUILD_TYPE ]; then
    echo "usage: $0 <source|release> <release-name> [--publish]"
    exit 1
fi

MB_TAG=$2
if [ -z $MB_TAG ]; then
    echo "usage: $0 <source|release> <release-name> [--publish] [--latest]"
    exit 1
fi

if [ "$3" == "--publish" ]; then
    PUBLISH="YES"
fi

if [ "$4" == "--latest" ]; then
    LATEST="YES"
fi

if [ "$PUBLISH" == "YES" ] && [ -z "$DOCKERHUB_USERNAME" -o -z "$DOCKERHUB_PASSWORD" ]; then
    echo "In order to publish an image to Dockerhub you must set \$DOCKERHUB_USERNAME and \$DOCKERHUB_PASSWORD before running."
    exit 1
fi

# TODO: verify we have access to docker cmd and minimum version?


if [ "$BUILD_TYPE" == "release" ]; then
    DOCKERHUB_REPOSITORY=metabase
    DOCKER_IMAGE="${DOCKERHUB_NAMESPACE}/${DOCKERHUB_REPOSITORY}:${MB_TAG}"

    echo "Building Docker image ${DOCKER_IMAGE} from official Metabase release ${MB_TAG}"

    # download the official version of Metabase which matches our tag
    curl -L -f -o ${BASEDIR}/metabase.jar https://downloads.metabase.com/${MB_TAG}/metabase.jar

    if [[ $? -ne 0 ]]; then
        echo "Download failed!"
        exit 1
    fi
else
    DOCKERHUB_REPOSITORY=metabase-head
    DOCKER_IMAGE="${DOCKERHUB_NAMESPACE}/${DOCKERHUB_REPOSITORY}:${MB_TAG}"

    echo "Building Docker image ${DOCKER_IMAGE} from local source"

    # trigger a full build
    ${PROJECT_ROOT}/bin/build

    if [ $? -eq 1 ]; then
        echo "Build failed!"
        exit 1
    fi

    # copy our built uberjar so that we can add it to our image
    cp ${PROJECT_ROOT}/target/uberjar/metabase.jar ${BASEDIR}/metabase.jar
fi


# now tell docker to build our image
# TODO: —-no-cache=true
docker build -t ${DOCKER_IMAGE} $BASEDIR

# TODO: validate our built docker image


if [ "$PUBLISH" == "YES" ]; then
    echo "Publishing image ${DOCKER_IMAGE} to Dockerhub"

    # make sure that we are logged into dockerhub
    docker login --username="${DOCKERHUB_USERNAME}" --password="${DOCKERHUB_PASSWORD}"

    # push the built image to dockerhub
    docker push ${DOCKER_IMAGE}

    # TODO: quick check against dockerhub to see that our new image made it

    if [ "$LATEST" == "YES" ]; then
        # tag our recent versioned image as "latest"
        docker tag -f ${DOCKER_IMAGE} ${DOCKERHUB_NAMESPACE}/${DOCKERHUB_REPOSITORY}:latest

        # then push it as well
        docker push ${DOCKERHUB_NAMESPACE}/${DOCKERHUB_REPOSITORY}:latest

        # TODO: validate push succeeded
    fi
fi

# TODO: cleanup after ourselves and remove the Metabase binary we downloaded
rm -f ${BASEDIR}/metabase.jar

echo "Done"
