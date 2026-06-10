git reset HEAD~1
rm ./backport.sh
git cherry-pick 7ff2080a852dbd30076a14bd7e15ab495b6f0b2a
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
