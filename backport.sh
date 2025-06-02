git reset HEAD~1
rm ./backport.sh
git cherry-pick e7ddf4d2604ea58a3bbbc7f117a74e194f7605dd
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
