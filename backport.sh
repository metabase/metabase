git reset HEAD~1
rm ./backport.sh
git cherry-pick 26f71cfeb54a5b8a48b078418399517cbf8cda09
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
