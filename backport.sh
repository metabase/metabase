git reset HEAD~1
rm ./backport.sh
git cherry-pick 88a87db2b8d2ca246c25a036517b09a81b0810c8
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
