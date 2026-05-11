git reset HEAD~1
rm ./backport.sh
git cherry-pick f09482e08fb6e50f6d99c52e77f909a055f41113
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
