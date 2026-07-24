git reset HEAD~1
rm ./backport.sh
git cherry-pick eaf53de0368771d051000945053066011980922e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
