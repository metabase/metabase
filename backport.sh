git reset HEAD~1
rm ./backport.sh
git cherry-pick adc28afc97ea8282966200b53a73a93f070e1fb2
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
