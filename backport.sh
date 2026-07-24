git reset HEAD~1
rm ./backport.sh
git cherry-pick 1c2e735ab038939e5aef4c11744ed5636a7c5816
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
