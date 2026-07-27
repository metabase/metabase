git reset HEAD~1
rm ./backport.sh
git cherry-pick 3c9fd3afe9d679b6fefaa3512e14f2edb11f4c74
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
