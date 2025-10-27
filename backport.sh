git reset HEAD~1
rm ./backport.sh
git cherry-pick 49c0589aa8283b1e2f5d9262601670e4adca1ecd
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
