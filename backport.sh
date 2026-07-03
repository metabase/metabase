git reset HEAD~1
rm ./backport.sh
git cherry-pick 863d48e92042f3fb0f8e2a36d40572786fd62d57
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
