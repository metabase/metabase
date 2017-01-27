#!/usr/bin/env bash

# this script will finalize a set of release artifacts after testing
# It should be run inside the metabase git repo, as it pulls out the latest 
# hash on the release branch 

set -eu


if [ $# -lt 1 ]; then
    echo "usage: $0 X.Y.Z [BRANCH]"
    exit 1
fi
VERSION=$1

if [ $# -lt 2 ]; then
    BRANCH="release-$VERSION"
else
    BRANCH=$2
fi

# check that docker is running
docker ps > /dev/null

# ensure DockerHub credentials are configured
if [ -z ${DOCKERHUB_EMAIL+x} ] || [ -z ${DOCKERHUB_USERNAME+x} ] || [ -z ${DOCKERHUB_PASSWORD+x} ]; then
    echo "Ensure DOCKERHUB_EMAIL, DOCKERHUB_USERNAME, and DOCKERHUB_PASSWORD are set.";
    exit 1
fi

DOCKERHUB_REPOSITORY=metabase/metabase

# tag our recent versioned image as "latest"
docker tag ${DOCKERHUB_REPOSITORY}:v$VERSION ${DOCKERHUB_REPOSITORY}:latest

# then push it as well
docker push ${DOCKERHUB_REPOSITORY}:latest




validate-docker-tag() {
  docker_tag="$1"
  docker pull "metabase/metabase:$docker_tag"
  version_info="$(docker run --rm -it --entrypoint java metabase/metabase:$docker_tag -jar /app/metabase.jar version | grep -oE '{[^}]+}')"

  expected_version="$2"
  actual_version="$(echo "$version_info" | grep -oE ':tag [^,}]+' | cut -c 6-)"
  if [ "$expected_version" != "$actual_version" ]; then
    echo "Docker imaged tagged '$docker_tag' has INCORRECT version '$actual_version', expected '$expected_version'";
    return 1
  fi

  expected_hash=$(git rev-list -n 1 "$expected_version")
  actual_hash="$(echo "$version_info" | grep -oE ':hash [^,}]+' | cut -c 7-)"
  # expected hash will be longer than actual hash, so just check that they start the same
  if [[ "$expected_hash" != $actual_hash* ]]; then
    echo "Docker imaged tagged '$docker_tag' has INCORRECT commit hash '$actual_hash', expected '$expected_hash'";
    return 1
  fi

  echo "Docker imaged tagged '$docker_tag' has correct version '$actual_version' and commit hash '$actual_hash'";
  return 0
}


validate-docker-tag "latest" "v$VERSION"
