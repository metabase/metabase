git reset HEAD~1
rm ./backport.sh
git cherry-pick 4299f31087a4f419a86a280f77a00379045b73a4
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
