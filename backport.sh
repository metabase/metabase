git reset HEAD~1
rm ./backport.sh
git cherry-pick 9b9b40a5f900b6dff6247b742e5a5c4049504903
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
