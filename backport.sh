git reset HEAD~1
rm ./backport.sh
git cherry-pick 6188ef843f96682cd85598d2c27ccf043365ac5f
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
