git reset HEAD~1
rm ./backport.sh
git cherry-pick 9ab71b7283c42b90f3a27288f0f4277e5d40c9e2
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
