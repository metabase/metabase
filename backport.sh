git reset HEAD~1
rm ./backport.sh
git cherry-pick db499c87019b0f2a689090e93ce800980d9c4bd3
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
