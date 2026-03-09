git reset HEAD~1
rm ./backport.sh
git cherry-pick 567bbd68bbfe179031320f94365d47c20d915a6f
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
