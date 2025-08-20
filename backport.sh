git reset HEAD~1
rm ./backport.sh
git cherry-pick 7f1391b53fce334f511a2d1d8c2c92d5bf73d1d8
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
