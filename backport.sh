git reset HEAD~1
rm ./backport.sh
git cherry-pick 22725a83b9fbd9b23e6b524e5074e7e017bdb645
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
