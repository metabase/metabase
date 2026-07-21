git reset HEAD~1
rm ./backport.sh
git cherry-pick 5cfbe5423ce77609ba59a824d07860cc1c9764a3
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
