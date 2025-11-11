git reset HEAD~1
rm ./backport.sh
git cherry-pick f78cf1648f8e160d667435f23e8b895ef9f6509a
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
