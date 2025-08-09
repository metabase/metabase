git reset HEAD~1
rm ./backport.sh
git cherry-pick c6674c01859f6a75111c9a2e98f08646cb67335b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
