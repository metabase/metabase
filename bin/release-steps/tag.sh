release-run () {
    cd "$RELEASE_REPO"
    git tag -a "v$VERSION" -m "v$VERSION"
    git push --follow-tags -u origin "$BRANCH"
}

release-validate () {
    cd "$RELEASE_REPO"
    git fetch
    git ls-remote --tags | grep "v$VERSION"
}
