#!/bin/bash

BASEDIR=$(dirname $0)

DOCKERHUB_NAMESPACE=metabase
DOCKERHUB_REPOSITORY=metabase

# parse any cmd line arguments
while [[ $# > 0 ]]
do
key="$1"

case $key in
    --publish)
    PUBLISH=YES
    ;;
    --latest)
    LATEST=YES
    ;;
    *)
        # unknown option
    ;;
esac

shift # past argument or value
done


if [ "$PUBLISH" == "YES" ] && [ -z "$DOCKERHUB_EMAIL" -o -z "$DOCKERHUB_USERNAME" -o -z "$DOCKERHUB_PASSWORD" ]; then
    echo "In order to publish an image to Dockerhub you must set \$DOCKERHUB_EMAIL, \$DOCKERHUB_USERNAME and \$DOCKERHUB_PASSWORD before running."
    exit 1
fi

# we need to know the tag of the current repo, and if we can't get a tag then bail
MB_TAG=`${BASEDIR}/../current_tag.sh`
if [ $? -eq 1 ]; then
    echo "Failed to get current tag from git.  Make sure you are on a tagged commit!"
    exit 1
fi

# TODO: verify we have access to docker cmd and minimum version?

echo "Building Docker image ${DOCKERHUB_NAMESPACE}/${DOCKERHUB_REPOSITORY}:${MB_TAG} from Metabase ${MB_TAG}"

# download the official version of Metabase which matches our tag
curl -o ${BASEDIR}/metabase.jar http://downloads.metabase.com/${MB_TAG}/metabase.jar

# TODO: verify the download

# now tell docker to build our image
# TODO: —-no-cache=true
docker build -t ${DOCKERHUB_NAMESPACE}/${DOCKERHUB_REPOSITORY}:${MB_TAG} $BASEDIR

# TODO: validate our built docker image

if [ "$PUBLISH" == "YES" ]; then
    echo "Publishing image ${DOCKERHUB_NAMESPACE}/${DOCKERHUB_REPOSITORY}:${MB_TAG} to Dockerhub"

    # make sure that we are logged into dockerhub
    docker login --email="${DOCKERHUB_EMAIL}" --username="${DOCKERHUB_USERNAME}" --password="${DOCKERHUB_PASSWORD}"

    # push the built image to dockerhub
    docker push ${DOCKERHUB_NAMESPACE}/${DOCKERHUB_REPOSITORY}:${MB_TAG}

    # TODO: quick check against dockerhub to see that our new image made it

    if [ "$LATEST" == "YES" ]; then
        # tag our recent versioned image as "latest"
        docker tag -f ${DOCKERHUB_NAMESPACE}/${DOCKERHUB_REPOSITORY}:${MB_TAG} ${DOCKERHUB_NAMESPACE}/${DOCKERHUB_REPOSITORY}:latest

        # then push it as well
        docker push ${DOCKERHUB_NAMESPACE}/${DOCKERHUB_REPOSITORY}:latest

        # TODO: validate push succeeded
    fi
fi

# TODO: cleanup after ourselves and remove the Metabase binary we downloaded
rm -f ${BASEDIR}/metabase.jar

echo "Done"

