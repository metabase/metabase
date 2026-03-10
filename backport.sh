git reset HEAD~1
rm ./backport.sh
git cherry-pick 22a1f275f0a549b8e91e1ca9a79d2dc1e7791ce2
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
