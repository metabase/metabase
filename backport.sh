git reset HEAD~1
rm ./backport.sh
git cherry-pick 7437cf370353ba561661ebdd8519a9d9d8c81234
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
