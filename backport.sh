git reset HEAD~1
rm ./backport.sh
git cherry-pick 5477bf1a8c45459a47781f2e820d62d302d0993b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
