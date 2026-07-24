git reset HEAD~1
rm ./backport.sh
git cherry-pick bb6977debd1e2517390f828f0228dba0e0b37dd3
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
