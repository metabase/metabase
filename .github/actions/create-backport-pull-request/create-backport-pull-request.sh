git config --global user.email "metabase-github-automation@metabase.com"
git config --global user.name "$GITHUB_ACTOR"

BACKPORT_BRANCH="backport-$COMMIT"

git fetch --all
git checkout -b "${BACKPORT_BRANCH}" origin/"${TARGET_BRANCH}"
git cherry-pick "${COMMIT}"
git push -u origin "${BACKPORT_BRANCH}"

hub pull-request -b "${TARGET_BRANCH}" -h "${BACKPORT_BRANCH}" -l "auto-backported" -a "${GITHUB_ACTOR}" -F- <<<"🤖 backported \"${ORIGINAL_TITLE}\" \n\n \#${ORIGINAL_PULL_REQUEST_NUMBER}"
