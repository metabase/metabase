git reset HEAD~1
rm ./backport.sh
git cherry-pick 76b863c7ea43027cd4720b7ca159a18ecba21b54
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
