git reset HEAD~1
rm ./backport.sh
git cherry-pick a317fbf1b85a8ad3874aae96357035bc04b5c541
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
