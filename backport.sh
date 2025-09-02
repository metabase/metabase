git reset HEAD~1
rm ./backport.sh
git cherry-pick f80fee03bd59eddb82c7d8ae3beaaf2590ef1fc5
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
