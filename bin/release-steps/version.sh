
release-run () {
    cd "$RELEASE_REPO"
    sed -i '' s/^VERSION.*/VERSION=\"v$VERSION\"/ bin/version
    git commit -m "v$VERSION" bin/version || true
}

release-validate () {
    cd "$RELEASE_REPO"
    grep "v$VERSION" bin/version
}
