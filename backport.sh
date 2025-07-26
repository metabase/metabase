git reset HEAD~1
rm ./backport.sh
git cherry-pick 832e2b7ac5ef80113c74f2ebc9300e8d18911e30
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
