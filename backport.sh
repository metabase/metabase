git reset HEAD~1
rm ./backport.sh
git cherry-pick 57afac78ba9bbaeec42a2e3c4785eebc6b4b5804
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
