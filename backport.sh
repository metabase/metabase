git reset HEAD~1
rm ./backport.sh
git cherry-pick 65f07f2d116bf4b92a000d2e3a677c5bb2d71a4e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
