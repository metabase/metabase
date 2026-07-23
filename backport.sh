git reset HEAD~1
rm ./backport.sh
git cherry-pick f35f7450a661844b70d70244fda3d6ec4badeec9
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
