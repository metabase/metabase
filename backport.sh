git reset HEAD~1
rm ./backport.sh
git cherry-pick 6c7ddff080b1625c0c658acba15a5d63bf5c17d1
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
