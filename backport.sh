git reset HEAD~1
rm ./backport.sh
git cherry-pick 3b6dbaee4b5d4adaf2511ec624af2dfa02cddc9d
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
