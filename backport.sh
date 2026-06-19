git reset HEAD~1
rm ./backport.sh
git cherry-pick 3fc052ed125e8f2dacde36555a475e092c5d41ce
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
