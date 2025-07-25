git reset HEAD~1
rm ./backport.sh
git cherry-pick 206f7eaccbba6278a050f386382060c1ca177e51
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
