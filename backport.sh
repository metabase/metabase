git reset HEAD~1
rm ./backport.sh
git cherry-pick cdac81f0cc922bdfa83516555b50e4603664253e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
