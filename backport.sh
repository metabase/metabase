git reset HEAD~1
rm ./backport.sh
git cherry-pick 478cd9f9331df81dd2b26f6bfcf25b8eecbef510
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
