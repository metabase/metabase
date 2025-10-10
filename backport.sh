git reset HEAD~1
rm ./backport.sh
git cherry-pick 21e9d33c668d1b05539f0db544f7eaeb2f4aebe1
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
