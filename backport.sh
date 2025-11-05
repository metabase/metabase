git reset HEAD~1
rm ./backport.sh
git cherry-pick 2df9e2645f73c6c33f38ad44a9f849c387bd1559
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
