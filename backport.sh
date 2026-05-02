git reset HEAD~1
rm ./backport.sh
git cherry-pick d618a0622f046810e416dbbe0922c4cb1ea34ff2
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
