git reset HEAD~1
rm ./backport.sh
git cherry-pick a93af09ff528e9405066d70012b100bde2c29d70
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
