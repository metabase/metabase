git reset HEAD~1
rm ./backport.sh
git cherry-pick 7afc643c0c7a9b8f456ca1f5432a1932a6b57c40
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
