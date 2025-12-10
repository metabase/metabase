git reset HEAD~1
rm ./backport.sh
git cherry-pick 590bd138c5d6bd29c052d6038a2f43219935d9b9
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
