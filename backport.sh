git reset HEAD~1
rm ./backport.sh
git cherry-pick 1f99507ef568474ae5899350236d3406e8ba7ca1
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
