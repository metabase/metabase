git reset HEAD~1
rm ./backport.sh
git cherry-pick 3eabd5847fd9d419b98814e040255063a99c9576
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
