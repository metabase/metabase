git reset HEAD~1
rm ./backport.sh
git cherry-pick e925a8df9407fb27453fe231ddf3ebb1c1a1c67e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
