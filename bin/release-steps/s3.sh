if [ -z ${AWS_DEFAULT_PROFILE+x} ]; then
    echo "Using default AWS_DEFAULT_PROFILE.";
    AWS_DEFAULT_PROFILE=default
fi

release-dependencies () {
  if [ -z ${AWS_DEFAULT_PROFILE+x} ]; then
      echo "AWS_DEFAULT_PROFILE must be set";
  fi
}

release-run () {
  aws s3 cp "$RELEASE_REPO/target/uberjar/metabase.jar" "s3://downloads.metabase.com/v$VERSION/metabase.jar"
}

release-validate () {
  curl --fail -I "http://downloads.metabase.com/v$VERSION/metabase.jar"
}
