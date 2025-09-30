git reset HEAD~1
rm ./backport.sh
git cherry-pick 8ba64b7bcd37cce6eeeda7a129b471ec43443830
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
