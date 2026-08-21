git reset HEAD~1
rm ./backport.sh
git cherry-pick d914e47f76ee787e0e16a89d36a9cc69a12e7360
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
