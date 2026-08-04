git reset HEAD~1
rm ./backport.sh
git cherry-pick 43915d73538f3c4028ed9bc5823564308d1c34f7
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
