git reset HEAD~1
rm ./backport.sh
git cherry-pick 73cd4c7c1e073bb1394adb1e34bc4b2ec1acf17b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
