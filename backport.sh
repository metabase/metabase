git reset HEAD~1
rm ./backport.sh
git cherry-pick e73b625533db40addcbdaad7d948e3a04478b634
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
