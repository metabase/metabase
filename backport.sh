git reset HEAD~1
rm ./backport.sh
git cherry-pick b1cc2fb7ec7eef14e85e6052c67cdd97592244d0
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
