release-dependencies () {
  # ensure the main repo is cloned
  if ! [ -d "$RELEASE_REPO" ]; then
      git clone git@github.com:metabase/metabase.git "$RELEASE_REPO"
  fi
}

release-run () {
  cd "$RELEASE_REPO"
  git fetch
  git co "$BRANCH"
}

release-validate () {
  cd "$RELEASE_REPO"
  branch="$(git rev-parse --abbrev-ref HEAD)"
  [ "$branch" = "$BRANCH" ]
}
