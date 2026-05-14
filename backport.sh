git reset HEAD~1
rm ./backport.sh
git cherry-pick 2eb9d4973897a14623e092c7235775e5b8034091
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
