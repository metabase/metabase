git reset HEAD~1
rm ./backport.sh
git cherry-pick 286b89bf92e45458bc1c6946cd7456e95120b17c
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
