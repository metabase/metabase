git reset HEAD~1
rm ./backport.sh
git cherry-pick e9235e29831404b7c3a10458e001e1caf7d0fb60
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
