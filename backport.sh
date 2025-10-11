git reset HEAD~1
rm ./backport.sh
git cherry-pick 9f1fb571773d3526b0371a95341fcddca1fcbe40
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
