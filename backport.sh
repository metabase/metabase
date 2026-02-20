git reset HEAD~1
rm ./backport.sh
git cherry-pick ba302fc0ef518803a799c5132b4b7ca8daf0da28
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
