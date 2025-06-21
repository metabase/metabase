git reset HEAD~1
rm ./backport.sh
git cherry-pick efcc142db06548466a61ad676742b67654cdfa73
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
