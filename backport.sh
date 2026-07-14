git reset HEAD~1
rm ./backport.sh
git cherry-pick e7211002cf3b415252a19e007e08081971b82468
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
