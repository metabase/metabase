git reset HEAD~1
rm ./backport.sh
git cherry-pick e8b8ad1a889514adf0645f16352e4f779d7128dc
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
