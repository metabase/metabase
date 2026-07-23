git reset HEAD~1
rm ./backport.sh
git cherry-pick 8ee3e5213cdd285ba3e9a0532096ae2748c2317d
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
