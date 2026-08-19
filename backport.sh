git reset HEAD~1
rm ./backport.sh
git cherry-pick 368c50f7e4d5ab3013c7d205ac54ee473c91c0ec
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
