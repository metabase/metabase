git reset HEAD~1
rm ./backport.sh
git cherry-pick 7ae5004486ab60195b1064aa8b3e8678807fee23
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
