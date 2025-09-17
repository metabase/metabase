git reset HEAD~1
rm ./backport.sh
git cherry-pick 7f4cb813c2f1666dd766eaff78a3039f360764cc
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
