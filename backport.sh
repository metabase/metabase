git reset HEAD~1
rm ./backport.sh
git cherry-pick 7619844a88305262c6bce61a1381e1d0e106801e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
