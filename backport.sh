git reset HEAD~1
rm ./backport.sh
git cherry-pick 0e20f5a8b8b4401d22a49679683ac3a685747627
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
