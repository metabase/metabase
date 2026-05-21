git reset HEAD~1
rm ./backport.sh
git cherry-pick c3b66e89df9bf7ff9d5cb3fbdc896031741820e5
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
