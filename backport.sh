git reset HEAD~1
rm ./backport.sh
git cherry-pick 7c58c0539f3b3f502e5f15df87031382a2b3a468
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
