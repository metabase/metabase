git reset HEAD~1
rm ./backport.sh
git cherry-pick 478b097458920f01691aba04e79c678eb78cbe30
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
