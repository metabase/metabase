git reset HEAD~1
rm ./backport.sh
git cherry-pick dc5ed72564b688d23de05b3d52aa0a3265239b21
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
