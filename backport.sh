git reset HEAD~1
rm ./backport.sh
git cherry-pick 9ad40ab1c35c058f5a1e9207be26bebbe8a6e353
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
