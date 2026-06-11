git reset HEAD~1
rm ./backport.sh
git cherry-pick 6cb272064faaa29722970073893865caf3ee808b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
