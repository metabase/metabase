git reset HEAD~1
rm ./backport.sh
git cherry-pick b55bed1cc1fa62ec414e652b6dea4a7f0c809352
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
