git reset HEAD~1
rm ./backport.sh
git cherry-pick a77b7d2ed8b99d4c19e0bf594130d33970b406db
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
