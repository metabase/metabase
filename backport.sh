git reset HEAD~1
rm ./backport.sh
git cherry-pick 6eff4789f0e5da62787bb4a301d7f83fba6a8391
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
