#!/bin/bash

TOKEN=$1
ORG_NAME=$2
USERNAME=$3

response=$(curl -L -o /dev/null -w "%{http_code}" \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/orgs/$ORG_NAME/members/$USERNAME")

# Github returns an empty response with 204 status if user is a member and 404 status otherwise
# See: https://docs.github.com/en/rest/orgs/members?apiVersion=2022-11-28#check-organization-membership-for-a-user
if [ "$response" == "204" ]; then
    echo "The user $USERNAME is a member of $ORG_NAME"
    echo "is_member=true" >> $GITHUB_OUTPUT
elif [ "$response" == "404" ]; then
    echo "The user $USERNAME is not a member of $ORG_NAME"
    echo "is_member=false" >> $GITHUB_OUTPUT
else
    echo "Failed to determine the membership status for $USERNAME in $ORG_NAME"
    echo "is_member=false" >> $GITHUB_OUTPUT
    exit 1
fi
