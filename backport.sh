git reset HEAD~1
rm ./backport.sh
git cherry-pick 74af0a368d8cf240110213e74af6023fe251ebdd
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
