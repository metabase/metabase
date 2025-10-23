git reset HEAD~1
rm ./backport.sh
git cherry-pick c5da59566ed3ca66b3599e5032c2506075057cc0
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
