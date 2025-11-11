git reset HEAD~1
rm ./backport.sh
git cherry-pick 9584d61b16bf75bd7e2d17916a44a616a035aaa2
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
