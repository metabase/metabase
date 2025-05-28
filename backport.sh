git reset HEAD~1
rm ./backport.sh
git cherry-pick d254909d96c03529459a3e50ccd8cdd59db512bb
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
