git reset HEAD~1
rm ./backport.sh
git cherry-pick c24ea41f56b501e97379c7bab02ecaee75be7440
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
