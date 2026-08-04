git reset HEAD~1
rm ./backport.sh
git cherry-pick e4705cad9b9764172611430f884e02a8db641bda
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
