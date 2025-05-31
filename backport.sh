git reset HEAD~1
rm ./backport.sh
git cherry-pick 965d41f3fff0c58a02467fc578fa747a8e54cd43
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
