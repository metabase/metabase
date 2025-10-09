git reset HEAD~1
rm ./backport.sh
git cherry-pick 73d896e66139c7266a3b0a8c1f80a2f21345288b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
