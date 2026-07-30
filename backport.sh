git reset HEAD~1
rm ./backport.sh
git cherry-pick a6a112c2ab881d9a5401305da688e478a84f3f66
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
