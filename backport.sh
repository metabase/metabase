git reset HEAD~1
rm ./backport.sh
git cherry-pick b2d652c6ab417a40c354cb5fd9353a97c3e40f06
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
