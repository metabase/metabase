git reset HEAD~1
rm ./backport.sh
git cherry-pick 9ac8f80da8f747124f6c621bef6cfbad82475e90
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
