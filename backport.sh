git reset HEAD~1
rm ./backport.sh
git cherry-pick e7edd174836e9d3ba481f75afb34f4ff7db5bb6f
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
