git reset HEAD~1
rm ./backport.sh
git cherry-pick 86e5e9d0e042e41eea50496c81a8629229746e15
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
