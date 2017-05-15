release-run () {
  echo "Publish the blog post, if any, then press enter."
  read
}

release-validate () {
  minor_version=$(echo $VERSION | grep -oE '^\d+\.\d+')
  curl --fail -I "http://www.metabase.com/blog/Metabase-$minor_version"
}
