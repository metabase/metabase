git reset HEAD~1
rm ./backport.sh
git cherry-pick 5a11a8d3e85f01be7ef61dfe5626321b52f303b1
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
