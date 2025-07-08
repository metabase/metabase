git reset HEAD~1
rm ./backport.sh
git cherry-pick 50ba7910a0e9940721f24f00eef88d55867bb4b0
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
