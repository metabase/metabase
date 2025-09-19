git reset HEAD~1
rm ./backport.sh
git cherry-pick 3fddbec54e203d6e444892ac6c5f72ca02d2f21c
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
