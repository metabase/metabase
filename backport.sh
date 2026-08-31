git reset HEAD~1
rm ./backport.sh
git cherry-pick 52fa5626a2c215acf8f080b1543eebb81f098b93
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
