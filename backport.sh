git reset HEAD~1
rm ./backport.sh
git cherry-pick 6bd66a6d5eba1624badde168e15253c6db5f8a8c
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
