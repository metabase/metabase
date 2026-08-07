git reset HEAD~1
rm ./backport.sh
git cherry-pick ab962a316a2f6f55a6f14220b785de9bfb2c3ca5
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
