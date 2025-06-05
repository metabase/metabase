git reset HEAD~1
rm ./backport.sh
git cherry-pick 10205ea677ff19e8ad4eb12864af70a7762b0d80
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
