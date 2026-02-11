git reset HEAD~1
rm ./backport.sh
git cherry-pick ef622a48325e7daa11dcf727acbcf42818fb9faa
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
