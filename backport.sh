git reset HEAD~1
rm ./backport.sh
git cherry-pick ece1b7cefb7f12c57b339aaf358294cc3dfb3b52
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
