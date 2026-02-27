git reset HEAD~1
rm ./backport.sh
git cherry-pick d1e7b483dd26256961d4f8733f56d90460b92954
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
