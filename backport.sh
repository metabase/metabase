git reset HEAD~1
rm ./backport.sh
git cherry-pick 89dd4a6db2f52773d28e54b4bb6de5992c665bf3
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
