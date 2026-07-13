git reset HEAD~1
rm ./backport.sh
git cherry-pick 669dc959ff652daa0f7eaf9c27e18239f5ff0997
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
