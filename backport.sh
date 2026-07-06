git reset HEAD~1
rm ./backport.sh
git cherry-pick b0682e01441cb8dd066a02e004bd8e3bf5bc430f
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
