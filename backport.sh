git reset HEAD~1
rm ./backport.sh
git cherry-pick d9b8b9a2c057d06cb6ffc6a73f682359ccbe4f8e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
