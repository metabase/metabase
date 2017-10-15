release-dependencies () {
  # check that docker is running
  docker ps > /dev/null

  # ensure DockerHub credentials are configured
  if [ -z ${DOCKERHUB_REPOSITORY} || -z ${DOCKERHUB_EMAIL+x} ] || [ -z ${DOCKERHUB_USERNAME+x} ] || [ -z ${DOCKERHUB_PASSWORD+x} ]; then
      echo "Ensure DOCKERHUB_EMAIL, DOCKERHUB_USERNAME, and DOCKERHUB_PASSWORD are set.";
      return 1
  fi
}

release-run () {
  "$RELEASE_ROOT/bin/docker/build_image.sh" release "v$VERSION" --publish
}

release-validate () {
  true
}
