git reset HEAD~1
rm ./backport.sh
git cherry-pick 5ccc379d415df91e7b03f28b53e803273c668aff
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
