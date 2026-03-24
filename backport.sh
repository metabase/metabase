git reset HEAD~1
rm ./backport.sh
git cherry-pick afc8eb428ee0838dff038b278da6b8bb233c906a
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
