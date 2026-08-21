git reset HEAD~1
rm ./backport.sh
git cherry-pick df585230763d48bc9f113b56cd8f7142e433e35b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
