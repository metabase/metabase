git reset HEAD~1
rm ./backport.sh
git cherry-pick 973bddf9062b1723506dcad60767d32185484251
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
