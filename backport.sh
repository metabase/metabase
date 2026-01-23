git reset HEAD~1
rm ./backport.sh
git cherry-pick 094109142109ae093eced9661ce888bcd66838d2
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
