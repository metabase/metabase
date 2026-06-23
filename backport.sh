git reset HEAD~1
rm ./backport.sh
git cherry-pick 7d8738db7e3358864a0bff54de6a873f20cb13a2
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
