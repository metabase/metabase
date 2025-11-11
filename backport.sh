git reset HEAD~1
rm ./backport.sh
git cherry-pick 50c6890b0c3767d257335e2ed069baf0be3b5aab
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
