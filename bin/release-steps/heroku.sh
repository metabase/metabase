release-dependencies () {
  # ensure the main repo is cloned
  if ! [ -d "$RELEASE_REPO_HEROKU" ]; then
      git clone git@github.com:metabase/metabase-deploy.git "$RELEASE_REPO_HEROKU"
  fi
}

release-run () {
  cd "$RELEASE_REPO_HEROKU"
  git pull
  bin/release-heroku "v$VERSION"
}

release-validate () {
    cd "$RELEASE_REPO_HEROKU"
    git fetch
    git ls-remote --tags | grep "v$VERSION"
}
