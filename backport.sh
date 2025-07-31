git reset HEAD~1
rm ./backport.sh
git cherry-pick fa3b11fcde8e0dcfdfd80f77a70274fcbb0ece68
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
