git reset HEAD~1
rm ./backport.sh
git cherry-pick a1d5e4b0716be9a7a258adeb5bbd7e5a3fde64db
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
