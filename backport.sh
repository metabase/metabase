git reset HEAD~1
rm ./backport.sh
git cherry-pick d987764034994579b906c7aebf57cf9dbd07cf10
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
