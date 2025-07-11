git reset HEAD~1
rm ./backport.sh
git cherry-pick 02d236381fa42336b9a9b8b5fb003b44f4a8e641
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
