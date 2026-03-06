git reset HEAD~1
rm ./backport.sh
git cherry-pick 5b6e3071ac5145af4de7c95dc0d1b8bc3ded0311
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
