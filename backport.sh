git reset HEAD~1
rm ./backport.sh
git cherry-pick 3b2c520b0d5d3aa13e71fa801c4b057c03fcbb59
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
