git reset HEAD~1
rm ./backport.sh
git cherry-pick 24a9ec6182d9b3d8891746ef922a3a923caffcda
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
