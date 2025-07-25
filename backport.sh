git reset HEAD~1
rm ./backport.sh
git cherry-pick 08f7daa02ada68eb0b65ba2e2506f308b455cba7
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
