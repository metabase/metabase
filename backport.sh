git reset HEAD~1
rm ./backport.sh
git cherry-pick f5b36990722c11ad3d69e7f47062f4b6528ac280
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
