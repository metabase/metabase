git reset HEAD~1
rm ./backport.sh
git cherry-pick 2219786d93dc4143072f9cf8732ca69bb4c0886e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
