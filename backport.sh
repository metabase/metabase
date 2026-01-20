git reset HEAD~1
rm ./backport.sh
git cherry-pick 51eab9a902ed0bf46e9930281d21eefbc507f724
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
