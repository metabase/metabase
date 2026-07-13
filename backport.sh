git reset HEAD~1
rm ./backport.sh
git cherry-pick 6c25c787404600d28dc390d14efdbdd820880847
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
