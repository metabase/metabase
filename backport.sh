git reset HEAD~1
rm ./backport.sh
git cherry-pick ac22d632bced917a69cac52281770c1948a8d1c6
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
