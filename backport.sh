git reset HEAD~1
rm ./backport.sh
git cherry-pick a3aed2ab66645cb7802dc336f01bd8b849589628
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
