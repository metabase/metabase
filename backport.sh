git reset HEAD~1
rm ./backport.sh
git cherry-pick f0ef171d25878b7ae63f61294073bda55efe3f80
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
