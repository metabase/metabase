git reset HEAD~1
rm ./backport.sh
git cherry-pick 564723357660a624514b2600b9efabfd18ff50ef
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
