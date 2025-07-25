git reset HEAD~1
rm ./backport.sh
git cherry-pick f2b8b44d48e11c54eb77498302563d5968f00f46
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
