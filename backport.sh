git reset HEAD~1
rm ./backport.sh
git cherry-pick e0615cb2b5a2454ba6d4f9a958552246862097e1
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
