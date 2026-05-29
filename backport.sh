git reset HEAD~1
rm ./backport.sh
git cherry-pick 761a8527ad5691bd117b7ec6f974bba2e71cc023
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
