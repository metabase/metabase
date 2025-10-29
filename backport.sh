git reset HEAD~1
rm ./backport.sh
git cherry-pick eeb44b4b5a035ac40da81ea8edbf3fc7b6f3010d
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
