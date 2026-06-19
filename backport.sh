git reset HEAD~1
rm ./backport.sh
git cherry-pick b907ae761d8416a339946af516a147b7914fa258
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
