git reset HEAD~1
rm ./backport.sh
git cherry-pick 35a47b2418489793cfc57935eab781381398ee0a
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
