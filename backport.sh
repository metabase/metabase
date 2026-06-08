git reset HEAD~1
rm ./backport.sh
git cherry-pick 649b0e2b00ada96dc6c1f01f3363658604e963d9
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
