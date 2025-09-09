git reset HEAD~1
rm ./backport.sh
git cherry-pick e1f6606ba29c74b8cb546e0b768fadcf4c648128
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
