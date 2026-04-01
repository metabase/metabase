git reset HEAD~1
rm ./backport.sh
git cherry-pick 9ada59a8043f308ae6eb3a5c09524ee590ae9eab
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
