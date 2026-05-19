git reset HEAD~1
rm ./backport.sh
git cherry-pick 57db5261791b1f13c97ebd89e5b458ea466328b4
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
