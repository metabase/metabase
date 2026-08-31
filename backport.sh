git reset HEAD~1
rm ./backport.sh
git cherry-pick c5e99eb3208e68baf7142adb17a0ef5da20422f9
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
