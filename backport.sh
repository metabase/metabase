git reset HEAD~1
rm ./backport.sh
git cherry-pick d056853a8c24b9d8290b557e19b86a9a6b903f5a
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
