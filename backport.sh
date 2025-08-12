git reset HEAD~1
rm ./backport.sh
git cherry-pick 8c049ad6feef37342522257c846e8b2fcff01f36
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
