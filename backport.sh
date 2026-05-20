git reset HEAD~1
rm ./backport.sh
git cherry-pick 46538ebaa1db396e1a0b394bb11a83c34a989949
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
