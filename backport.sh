git reset HEAD~1
rm ./backport.sh
git cherry-pick 11f24779e22bcbc7f2bdfe52f42e76481f7533da
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
