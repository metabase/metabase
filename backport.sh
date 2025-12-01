git reset HEAD~1
rm ./backport.sh
git cherry-pick 9bef1912958a0d4d76a86785d0211402a448dc14
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
