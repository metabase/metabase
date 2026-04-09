git reset HEAD~1
rm ./backport.sh
git cherry-pick 3392486525d5e61550c2c42e6162ea9c39e39e6b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
