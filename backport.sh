git reset HEAD~1
rm ./backport.sh
git cherry-pick 4ff90118e8d5ac89ec3e4dfb778db873a5a82509
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
