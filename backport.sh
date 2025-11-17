git reset HEAD~1
rm ./backport.sh
git cherry-pick 33f9a3148d7fdda4ca2e8928c0514b7767741433
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
