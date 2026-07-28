git reset HEAD~1
rm ./backport.sh
git cherry-pick e312b487577d4ab375d06c6c656b6b82b66c0f04
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
