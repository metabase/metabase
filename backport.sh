git reset HEAD~1
rm ./backport.sh
git cherry-pick b7d74aab6df6d4181de5854b66304ae6e7e6c362
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
