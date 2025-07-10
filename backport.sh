git reset HEAD~1
rm ./backport.sh
git cherry-pick 9e37bd9d50a16c7674dfe52967e31307df360545
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
