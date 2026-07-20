git reset HEAD~1
rm ./backport.sh
git cherry-pick 3246bebfe4002d66c2150b99a188fde6322cc743
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
