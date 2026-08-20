git reset HEAD~1
rm ./backport.sh
git cherry-pick 272b17ffdd6f8005aaa3adeb3424a6de67a3bce7
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
