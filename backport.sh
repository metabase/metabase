git reset HEAD~1
rm ./backport.sh
git cherry-pick 351fdc90cfcf9a933b12751eb050463d48c43ace
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
