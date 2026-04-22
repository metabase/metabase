git reset HEAD~1
rm ./backport.sh
git cherry-pick f78efe0f4b3fb42f5804d7d7e29db020e9f97d9d
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
