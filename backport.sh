git reset HEAD~1
rm ./backport.sh
git cherry-pick 4022e26336e28d62c8c402a5b063f9acff6cde5b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
