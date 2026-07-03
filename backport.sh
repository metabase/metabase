git reset HEAD~1
rm ./backport.sh
git cherry-pick b83ac24d1ee7b080c00712b0a03fd444a43eb61e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
