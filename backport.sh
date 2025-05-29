git reset HEAD~1
rm ./backport.sh
git cherry-pick 38f130358c57a3c6cc903e9262f11cb42def663b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
