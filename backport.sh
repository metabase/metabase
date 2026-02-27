git reset HEAD~1
rm ./backport.sh
git cherry-pick 69bb6ba43c6dc990f11f20d952cf08a114198d92
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
