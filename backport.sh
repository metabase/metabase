git reset HEAD~1
rm ./backport.sh
git cherry-pick ce9ac84ecc28f791387cfa3ac511630fc46a7317
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
