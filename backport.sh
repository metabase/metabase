git reset HEAD~1
rm ./backport.sh
git cherry-pick 54a2ef930b85912318696c22a0ea3e6ea9bad818
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
