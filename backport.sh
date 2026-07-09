git reset HEAD~1
rm ./backport.sh
git cherry-pick 2744a626cb6447feafb58d97211005d166546766
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
