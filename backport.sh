git reset HEAD~1
rm ./backport.sh
git cherry-pick c13ba1bcc864a2c35ee6baaf7566cff21d860f40
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
