git fetch --all

echo "Looking for a commit that contains pull request number $PULL_REQUEST_NUMBER in $BASE_REF"
COMMIT=$(env -i git log $BASE_REF -- --grep="(#$PULL_REQUEST_NUMBER)" --format="%H")

echo "::set-output name=commit::$COMMIT"

