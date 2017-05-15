release-dependencies () {
  # check that docker is running
  docker ps > /dev/null

  # ensure DockerHub credentials are configured
  if [ -z ${DOCKERHUB_REPOSITORY} || -z ${DOCKERHUB_EMAIL+x} ] || [ -z ${DOCKERHUB_USERNAME+x} ] || [ -z ${DOCKERHUB_PASSWORD+x} ]; then
      echo "Ensure DOCKERHUB_EMAIL, DOCKERHUB_USERNAME, and DOCKERHUB_PASSWORD are set.";
      exit 1
  fi
}

release-run () {
  # tag our recent versioned image as "latest"
  docker tag ${DOCKERHUB_REPOSITORY}:v$VERSION ${DOCKERHUB_REPOSITORY}:latest

  # then push it as well
  docker push ${DOCKERHUB_REPOSITORY}:latest
}

release-validate () {
  true
}
