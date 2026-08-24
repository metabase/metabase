git reset HEAD~1
rm ./backport.sh
git cherry-pick 037092060e0355ea6a127b77943b21d62c31c6ef
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
