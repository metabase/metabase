git reset HEAD~1
rm ./backport.sh
git cherry-pick f9b914af2be467a49b325742097a486ca1e56d77
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
