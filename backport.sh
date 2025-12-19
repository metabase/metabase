git reset HEAD~1
rm ./backport.sh
git cherry-pick ae13d817bf4dff949bbc8bbad3e44a726db3a125
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
