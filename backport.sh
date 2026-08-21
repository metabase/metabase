git reset HEAD~1
rm ./backport.sh
git cherry-pick 7abb55964b2442b9ff65e75e41bd862be7a94430
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
