git reset HEAD~1
rm ./backport.sh
git cherry-pick 4b69a5a61da10ef5a3ef69172b042d0c79d94266
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
