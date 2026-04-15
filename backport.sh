git reset HEAD~1
rm ./backport.sh
git cherry-pick 4730f8aa923486c8fe4aa6537a7f2b918bf99603
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
