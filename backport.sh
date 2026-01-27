git reset HEAD~1
rm ./backport.sh
git cherry-pick f3c0be5fc166f476410a9fc06e37420a540000cc
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
