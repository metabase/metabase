git reset HEAD~1
rm ./backport.sh
git cherry-pick b25f53509fb958e0809ca04b88ebe5c707c30bf0
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
