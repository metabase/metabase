git reset HEAD~1
rm ./backport.sh
git cherry-pick 04a520b6587a81388e3186e71884ba031bb98264
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
