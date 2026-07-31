git reset HEAD~1
rm ./backport.sh
git cherry-pick e3e3a193f88b31c72aa7c244653c5222a14d91bc
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
