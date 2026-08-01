git reset HEAD~1
rm ./backport.sh
git cherry-pick 37fccf450cafbbeedb28ad926d38e463e0a6392f
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
