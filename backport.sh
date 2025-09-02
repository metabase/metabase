git reset HEAD~1
rm ./backport.sh
git cherry-pick dbdf070383624eb0107e58538e1997f5346b44bd
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
