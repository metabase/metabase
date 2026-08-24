git reset HEAD~1
rm ./backport.sh
git cherry-pick 0361fce5603e6c076ca10fb125957dab5fd74f8c
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
