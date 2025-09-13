git reset HEAD~1
rm ./backport.sh
git cherry-pick 5f5b2f6d076ea44fdea1c3bfe6b935c177ce8c36
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
