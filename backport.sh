git reset HEAD~1
rm ./backport.sh
git cherry-pick 1c6c3681a87744a07c1e8045e8967d90e56fccdb
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
