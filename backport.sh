git reset HEAD~1
rm ./backport.sh
git cherry-pick e89265e9357996b0b8fff96a0a1e5950d4ce7e2a
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
