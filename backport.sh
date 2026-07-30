git reset HEAD~1
rm ./backport.sh
git cherry-pick e415e8d14c9e302fb25f7c0e6367b503880b1672
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
