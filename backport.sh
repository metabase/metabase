git reset HEAD~1
rm ./backport.sh
git cherry-pick a822e1dd94309fb4be1b81d9633899acfcbc1192
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
