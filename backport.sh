git reset HEAD~1
rm ./backport.sh
git cherry-pick ea48474bcf51cac69a3870225a2e4868fa4b20e4
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
