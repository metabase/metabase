git reset HEAD~1
rm ./backport.sh
git cherry-pick aab42da74cc8fe75644c6556f90564582a1da04e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
