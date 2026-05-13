git reset HEAD~1
rm ./backport.sh
git cherry-pick 2b3901c5a9f2a03f540a02fc336c3629e56ab26e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
