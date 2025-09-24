git reset HEAD~1
rm ./backport.sh
git cherry-pick 9668ebe98c56af08e4aa9b3a1e6ccddaa59d4435
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
