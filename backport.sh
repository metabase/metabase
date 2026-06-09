git reset HEAD~1
rm ./backport.sh
git cherry-pick 95fa251fa6f5b3b0b9fcd3b9a547ce5a09b12f6b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
