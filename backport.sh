git reset HEAD~1
rm ./backport.sh
git cherry-pick e819ade16117d537b2aea26eee27005b76e2065d
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
