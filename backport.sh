git reset HEAD~1
rm ./backport.sh
git cherry-pick 08cfa3d14b586b940db334ca2511296015c35f76
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
