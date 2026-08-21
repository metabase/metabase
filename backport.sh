git reset HEAD~1
rm ./backport.sh
git cherry-pick 29afd6c0ade82a8d582a4bf5a85e01a58dafe4b9
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
