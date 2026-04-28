git reset HEAD~1
rm ./backport.sh
git cherry-pick c88f89d30a264461bb62da8cb75534b32fc2c5c2
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
