git reset HEAD~1
rm ./backport.sh
git cherry-pick fdace56d226db0249d4c2cfc28b4b4dd0f1cb8fa
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
