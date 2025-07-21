git reset HEAD~1
rm ./backport.sh
git cherry-pick 1cd2a7dafe0cd774621e973f6bc858dac256791d
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
