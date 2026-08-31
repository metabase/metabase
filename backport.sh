git reset HEAD~1
rm ./backport.sh
git cherry-pick 24f4aec505ebf0151168c9a646aafc7167aba7c8
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
