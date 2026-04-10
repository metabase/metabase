git reset HEAD~1
rm ./backport.sh
git cherry-pick 07325c8057ead0218c14731216ead4a68f76d610
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
