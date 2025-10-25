git reset HEAD~1
rm ./backport.sh
git cherry-pick 6ec03b098ec0e4e4e1f1bcf3eb37bc453e83cea5
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
