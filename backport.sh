git reset HEAD~1
rm ./backport.sh
git cherry-pick 925cfb5a640fa1f0100f5c53721ebdae18d57beb
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
