git reset HEAD~1
rm ./backport.sh
git cherry-pick 799f71841a1fff7c74e4ab43f37d64eba7bc4006
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
