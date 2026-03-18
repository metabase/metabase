git reset HEAD~1
rm ./backport.sh
git cherry-pick db25f8fa807a6ea547d2319c9bae09f5cc558933
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
