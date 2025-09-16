git reset HEAD~1
rm ./backport.sh
git cherry-pick b5942d4f36618a9eca6a692a8c50c078ba8e13b8
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
