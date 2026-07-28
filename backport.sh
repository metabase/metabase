git reset HEAD~1
rm ./backport.sh
git cherry-pick fc9441add09ae225e9e00fcab1887565feab2648
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
