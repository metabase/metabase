git reset HEAD~1
rm ./backport.sh
git cherry-pick bb4b24c65f2b9887c9c2c9c24fce1eb1b9f4cda8
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
