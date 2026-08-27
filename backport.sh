git reset HEAD~1
rm ./backport.sh
git cherry-pick 27852dcc4c490d074ebb5a62204461f44d513491
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
