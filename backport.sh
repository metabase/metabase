git reset HEAD~1
rm ./backport.sh
git cherry-pick ffec482d739f085ef383fb4c8522752a27f65015
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
