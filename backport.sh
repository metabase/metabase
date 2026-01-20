git reset HEAD~1
rm ./backport.sh
git cherry-pick 287665a6faf1e4859be6c1a7fa661b9c13d727cf
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
