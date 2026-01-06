git reset HEAD~1
rm ./backport.sh
git cherry-pick 0c04a6a3c1bba9506503bd8a162b7e9f833217b7
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
