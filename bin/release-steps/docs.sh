release-validate () {
  curl --fail -I "http://www.metabase.com/docs/v$VERSION/"
}
