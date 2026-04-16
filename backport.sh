git reset HEAD~1
rm ./backport.sh
git cherry-pick 2221a978a86b5e1386b34a1871b313ab0764c2d4
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
