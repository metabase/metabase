git reset HEAD~1
rm ./backport.sh
git cherry-pick 42a72602099e8de7caf619a545377666582c8e0e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
