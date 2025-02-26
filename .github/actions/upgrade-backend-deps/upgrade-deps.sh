#! /usr/bin/env bash

# Script is adapted from https://github.com/nnichols/clojure-dependency-update-action/blob/master/dependency-check.sh

# make sure we're in the root dir of the metabase repo
script_dir=`dirname "${BASH_SOURCE[0]}"`
cd "$script_dir/../../.."

echo `pwd`

# Configure Git user opening PRs to the GH Actions bot.
git config --global user.email "metabase-bot@metabase.com"
git config --global user.name "Metabase bot"

# Run antq to check for outdated dependencies and output to UPGRADE_LIST
echo "::group::Checking for outdated dependencies"
UPGRADE_LIST=$(clojure -M:outdated --reporter=format --error-format="{{name}},{{version}},{{latest-version}},{{diff-url}}")
echo "$UPGRADE_LIST"
echo "::endgroup::"

# Parse the output of antq into a list of upgrades, and remove any failed fetches
UPGRADES=$(echo ${UPGRADE_LIST} | sed '/Failed to fetch/d' | sed '/Unable to fetch/d' | sed '/Logging initialized/d' | sort -u)

echo "::group::Upgrades"
echo ${UPGRADES}
echo "::endgroup::"

# Make sure we're on master
git checkout master

# Iterate over all upgrades
for upgrade in $UPGRADES; do

  echo "::group::Processing upgrade"

  # Parse each upgrade into its constituent parts
  IFS=',' temp=($upgrade)
  DEP_NAME=${temp[0]}
  OLD_VERSION=${temp[1]}
  NEW_VERSION=${temp[2]}
  DIFF_URL=${temp[3]}
  MODIFIED_FILE=${temp[4]}
  BRANCH_NAME="dependencies/clojure/$DEP_NAME-$NEW_VERSION"

  # Checkout the branch if it exists, otherwise create it
  echo "Checking out" $BRANCH_NAME
  git checkout $BRANCH_NAME || git checkout -b $BRANCH_NAME

  # IF we successfully created a new branch, update the dependency
  if [[ $? == 0 ]]; then

    # Use antq to update the dependency
    echo "Updating" $DEP_NAME "version" $OLD_VERSION "to" $NEW_VERSION
    UPDATE_CMD="clojure -M:outdated --upgrade --force --focus=${DEP_NAME}"
    eval ${UPDATE_CMD} || $(echo "Cannot update ${DEP_NAME}. Continuing" && git checkout master && continue)

    TITLE="Bump $DEP_NAME from $OLD_VERSION to $NEW_VERSION"
    BODY="Inspect dependency changes here: $DIFF_URL"

    # Commit the dependency update, and link to the diff
    git add deps.edn modules
    git commit -m ${TITLE} -m ${BODY} --no-verify
    git push -u origin $BRANCH_NAME

    # Open the PR
    echo "Opening pull request for" $DEP_NAME
    PR_URL=$(gh pr create --base master --head $BRANCH_NAME --label "no-backport" --title ${TITLE} --body ${BODY})
    PR_NUMBER=${PR_URL##*/}
    echo "Opened PR #$PR_NUMBER"

    # Make the PR Auto-Merge
    gh pr merge -R metabase/metabase --squash --auto "$PR_NUMBER"

    # Print a blank line, and reset the branch
    echo "Checking out master" master
    git checkout master
  fi

  echo "::endgroup::"

done
