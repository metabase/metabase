git reset HEAD~1
rm ./backport.sh
git cherry-pick 6d294e5f4d200fe86e48665a9bfc7d6a09f36a8d
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
