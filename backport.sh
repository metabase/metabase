git reset HEAD~1
rm ./backport.sh
git cherry-pick 6ab20070a443c0cdb0f3460bccbd74dfcfb8356f
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
