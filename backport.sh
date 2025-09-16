git reset HEAD~1
rm ./backport.sh
git cherry-pick 25adbcfee8e00e30e2401bf34abad7c6a47423df
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
