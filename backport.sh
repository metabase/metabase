git reset HEAD~1
rm ./backport.sh
git cherry-pick e22e0e5fb17449320301586670df08184a8a53e9
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
