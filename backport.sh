git reset HEAD~1
rm ./backport.sh
git cherry-pick 4809d20eae046946e6f8efd2fd9095296d235398
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
