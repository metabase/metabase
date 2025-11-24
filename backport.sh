git reset HEAD~1
rm ./backport.sh
git cherry-pick 857bdadd45b4b487d5bba2c173b89524bd28807e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
