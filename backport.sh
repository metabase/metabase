git reset HEAD~1
rm ./backport.sh
git cherry-pick 0869369208c0422dd26b9c6c54651a17f8629924
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
