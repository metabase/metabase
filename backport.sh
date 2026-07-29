git reset HEAD~1
rm ./backport.sh
git cherry-pick bb4fa3fcf4d6679ed22f83bb926cc226045e4a0a
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
