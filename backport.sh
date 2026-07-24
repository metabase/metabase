git reset HEAD~1
rm ./backport.sh
git cherry-pick 93f9a2fa2cda309449069cf88d6b2dc8df8573b0
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
