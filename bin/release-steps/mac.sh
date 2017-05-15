if [ -z ${AWS_DEFAULT_PROFILE+x} ]; then
    echo "Using default AWS_DEFAULT_PROFILE.";
    AWS_DEFAULT_PROFILE=default
fi

release-validate () {
  curl --fail -I http://downloads.metabase.com/v$VERSION/Metabase.dmg
}
