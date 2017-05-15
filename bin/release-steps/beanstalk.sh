if [ -z ${AWS_DEFAULT_PROFILE+x} ]; then
    echo "Using default AWS_DEFAULT_PROFILE.";
    AWS_DEFAULT_PROFILE=default
fi

release-dependencies () {
  if [ -z ${AWS_DEFAULT_PROFILE+x} ]; then
      echo "AWS_DEFAULT_PROFILE must be set";
  fi
}

release-run() {
  cd "$RELEASE_REPO";
  bin/aws-eb-docker/release-eb-version.sh "v$VERSION"
}

release-validate() {
  curl --fail -I "http://downloads.metabase.com/v$VERSION/launch-aws-eb.html"
}
