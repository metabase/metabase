git reset HEAD~1
rm ./backport.sh
git cherry-pick a563b90b2785ac045585090ad9072df72ac3c2c3
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
