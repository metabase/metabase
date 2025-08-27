git reset HEAD~1
rm ./backport.sh
git cherry-pick 00a034905b037253d202c04fa827648485b1aaf9
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
