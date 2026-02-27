git reset HEAD~1
rm ./backport.sh
git cherry-pick fe325b3de7b7dd474ee59fc3fa2556f3f3f14a34
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
