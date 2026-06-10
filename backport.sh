git reset HEAD~1
rm ./backport.sh
git cherry-pick 05a70000b566a0e3da70a558cfafe2c9636e61b2
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
