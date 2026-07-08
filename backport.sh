git reset HEAD~1
rm ./backport.sh
git cherry-pick b48d367c212a7132e1da44714a6a72ae6e255000
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
