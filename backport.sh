git reset HEAD~1
rm ./backport.sh
git cherry-pick c2611229996777a6b56f6f67f80b4a35d1e3e84a
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
