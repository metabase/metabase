git reset HEAD~1
rm ./backport.sh
git cherry-pick 866c8403556759fa5146a0c5b6a64e2c85ec962d
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
