git reset HEAD~1
rm ./backport.sh
git cherry-pick 0be7ef31cf5c1b56cf02ab9f62abc7ab9926b01f
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
