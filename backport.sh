git reset HEAD~1
rm ./backport.sh
git cherry-pick 2d5d40a9abee16b9d4926e627d300ae764a43dbe
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
