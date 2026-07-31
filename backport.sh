git reset HEAD~1
rm ./backport.sh
git cherry-pick 5918cc9a6b3a658dbba65dcd1012e0ec42ff16ed
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
