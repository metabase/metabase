git reset HEAD~1
rm ./backport.sh
git cherry-pick d4d83d2f8e7281700e0123cdaf8578b633b48284
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
