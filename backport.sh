git reset HEAD~1
rm ./backport.sh
git cherry-pick be36bd367dc6cc62c78c3a5f3c3e8f2271d1cb9c
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
