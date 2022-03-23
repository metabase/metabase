echo "looking for a commit that contains pull request number ${PULL_REQUEST_NUMBER} in master"
COMMIT=$(env -i git log master --grep="(#${PULL_REQUEST_NUMBER})" --format="%H")

echo "::set-output name=commit::$COMMIT"
