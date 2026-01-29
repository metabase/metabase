git reset HEAD~1
rm ./backport.sh
git cherry-pick 730265b198a3aa80497e89fa2fcbb21d8ebf5d28
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
