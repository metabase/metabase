git reset HEAD~1
rm ./backport.sh
git cherry-pick a3b1e81cd8091b9a96c13f9ea04755041f52cb24
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
