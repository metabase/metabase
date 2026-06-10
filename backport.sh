git reset HEAD~1
rm ./backport.sh
git cherry-pick 155bac70a74ff854e2ec5d5c08bc1444ed2afc7f
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
