git reset HEAD~1
rm ./backport.sh
git cherry-pick 3459c5344d2a1b862010076124b7d86e85054d8d
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
