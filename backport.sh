git reset HEAD~1
rm ./backport.sh
git cherry-pick 373b755b501de2525cff5ab7c0a588086a9e9862
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
