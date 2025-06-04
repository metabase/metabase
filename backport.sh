git reset HEAD~1
rm ./backport.sh
git cherry-pick 0e9b9b9d2ece6775ee7cc656a66340d8d20d5198
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
