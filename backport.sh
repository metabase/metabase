git reset HEAD~1
rm ./backport.sh
git cherry-pick f290bbbbe0b9b02ad6d211bdbd805e5ea38cd040
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
