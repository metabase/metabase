git reset HEAD~1
rm ./backport.sh
git cherry-pick 8b0f6d14f8fb24c4593cee3036496fa3de6cead6
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
