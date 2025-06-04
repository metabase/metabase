git reset HEAD~1
rm ./backport.sh
git cherry-pick 08fdb5a698e99d51c387a43202c2e2577b460a91
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
