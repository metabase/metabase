git reset HEAD~1
rm ./backport.sh
git cherry-pick 2454ab71888865b6639923b06a7906297dc2f8a1
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
