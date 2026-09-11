git reset HEAD~1
rm ./backport.sh
git cherry-pick 0dc220840e705415259b0c69481792f3b760d04e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
