git reset HEAD~1
rm ./backport.sh
git cherry-pick 9845f0e9640ac744c5da2957113902980229a2f4
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
