git reset HEAD~1
rm ./backport.sh
git cherry-pick e3791b88e8748813d362750779724f6aed270636
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
