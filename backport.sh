git reset HEAD~1
rm ./backport.sh
git cherry-pick ba4c6a87c32c5424662422bc1c006d97144df323
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
