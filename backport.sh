git reset HEAD~1
rm ./backport.sh
git cherry-pick 7a469b6cda87a75a83c2ecbb51feeef36062fa9a
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
