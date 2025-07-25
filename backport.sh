git reset HEAD~1
rm ./backport.sh
git cherry-pick 647058ec89718c7b164f5fec1072d9de63e5dc15
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
