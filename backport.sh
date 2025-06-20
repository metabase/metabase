git reset HEAD~1
rm ./backport.sh
git cherry-pick a158877776536fa13b3a7261115d501d8027b200
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
