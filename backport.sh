git reset HEAD~1
rm ./backport.sh
git cherry-pick 70da910602687a877172b1cca75f2f13da4cac56
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
