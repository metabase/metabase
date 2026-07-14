git reset HEAD~1
rm ./backport.sh
git cherry-pick d3a8d674300740174816be436bff1962ce2c3b7b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
