git reset HEAD~1
rm ./backport.sh
git cherry-pick aa5c870dc45731a3b179987ba4a8a51bb1da771e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
