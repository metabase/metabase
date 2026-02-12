git reset HEAD~1
rm ./backport.sh
git cherry-pick 355a5fc29cb046988ab2aed60ba7e6b6deb2ce02
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
