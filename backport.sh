git reset HEAD~1
rm ./backport.sh
git cherry-pick 9e775ebc4a2b0a454672e1a73b4f5d63629c1a85
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
