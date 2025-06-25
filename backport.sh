git reset HEAD~1
rm ./backport.sh
git cherry-pick cc84b518f228ea6cbb571bc6a3675bc0bddfc824
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
