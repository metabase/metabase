git reset HEAD~1
rm ./backport.sh
git cherry-pick 5f8b4e95eb5f969a09a637dd28a990a4bbdc9f1b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
