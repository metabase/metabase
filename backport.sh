git reset HEAD~1
rm ./backport.sh
git cherry-pick 359158e594b8c959dc2f82c8ce5ccfb372721862
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
