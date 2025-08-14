git reset HEAD~1
rm ./backport.sh
git cherry-pick 49389aea8049acb47c2d954f65f7562d35e64ff0
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
