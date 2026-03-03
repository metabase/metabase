git reset HEAD~1
rm ./backport.sh
git cherry-pick ea89a862eccada35b52b1be387f319ab9d072dbd
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
