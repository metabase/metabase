git reset HEAD~1
rm ./backport.sh
git cherry-pick 55985595206ed3eeb9a7ce07c35feeca889fca2a
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
