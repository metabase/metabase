git reset HEAD~1
rm ./backport.sh
git cherry-pick 0ec522227b59e763cb65583dbe9e2bf58f4f0614
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
