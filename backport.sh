git reset HEAD~1
rm ./backport.sh
git cherry-pick 1c7ac880065a72b98544caf5442fb071ce8c8dad
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
