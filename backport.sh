git reset HEAD~1
rm ./backport.sh
git cherry-pick b04009322f2b73461c9d3c3bdd75472e15a4d9d3
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
