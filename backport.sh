git reset HEAD~1
rm ./backport.sh
git cherry-pick c16d08579d4a76b1f31d0828ca8f922f6f15534f
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
