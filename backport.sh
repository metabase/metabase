git reset HEAD~1
rm ./backport.sh
git cherry-pick 83ca220730860670f0cc0e032c8a25d17e2c6124
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
