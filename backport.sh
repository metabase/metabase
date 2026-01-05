git reset HEAD~1
rm ./backport.sh
git cherry-pick 4521f75ee6ed5435d89024ba867fb9227f742a69
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
