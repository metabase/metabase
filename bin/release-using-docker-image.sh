#! /usr/bin/env bash

set -eou pipefail

# switch to the Metabase root directory
script_directory=`dirname "${BASH_SOURCE[0]}"`
cd "$script_directory/.."

# --no-cache
docker build \
       --network host \
       --pull \
       -t metabase/release \
       --file bin/release/Dockerfile \
       .

docker run \
       --network host \
       -v /var/run/docker.sock:/var/run/docker.sock \
       --mount type=bind,source="$(readlink -f ~/.aws)",target=/root/.aws,readonly \
       --mount type=bind,source="$(readlink -f ~/.ssh)",target=/root/.ssh,readonly \
       --env DOCKERHUB_EMAIL="$DOCKERHUB_EMAIL" \
       --env DOCKERHUB_USERNAME="$DOCKERHUB_USERNAME" \
       --env DOCKERHUB_PASSWORD="$DOCKERHUB_PASSWORD" \
       --env GITHUB_TOKEN="$GITHUB_TOKEN" \
       --env SLACK_WEBHOOK_URL="$SLACK_WEBHOOK_URL" \
       --env AWS_DEFAULT_PROFILE="$AWS_DEFAULT_PROFILE" \
       -it metabase/release
