git reset HEAD~1
rm ./backport.sh
git cherry-pick fa0d39183e2de2860261981bd7e6d2d209c5179c
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
