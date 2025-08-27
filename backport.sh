git reset HEAD~1
rm ./backport.sh
git cherry-pick 0358ebe99d7fa154df1626aca71e2a186872d695
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
