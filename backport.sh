git reset HEAD~1
rm ./backport.sh
git cherry-pick 23eeb71330f5b890da644090a7f8124f91c5f9f3
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
