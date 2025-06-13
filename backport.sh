git reset HEAD~1
rm ./backport.sh
git cherry-pick 44bf519b7434a5675672cd8244cb14b5f9755186
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
