
# TODO: use ./bin/update-version-info?
release-run () {
  echo "Publish version-info.json, then press enter."
  read
}

release-validate () {
  curl --fail "http://static.metabase.com/version-info.json" | grep "v$VERSION"
}
