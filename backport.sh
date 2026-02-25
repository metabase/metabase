git reset HEAD~1
rm ./backport.sh
git cherry-pick 09ee4178ca31f7ca9aa627390d1d920a6f417af2
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
