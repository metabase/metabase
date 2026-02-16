git reset HEAD~1
rm ./backport.sh
git cherry-pick 5259af771e53f6d4999c483473294637ef5a075b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
