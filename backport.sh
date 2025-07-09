git reset HEAD~1
rm ./backport.sh
git cherry-pick 5dbb3648cff1afdcfafbb7199cadfb38cfa7b181
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
