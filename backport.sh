git reset HEAD~1
rm ./backport.sh
git cherry-pick f8ce01fccad283b55313391e1bdc776a9f5814c7
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
