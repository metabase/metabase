git reset HEAD~1
rm ./backport.sh
git cherry-pick 7273730111d0de012e29173c274feda0d47787a7
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
