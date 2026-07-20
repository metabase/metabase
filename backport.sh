git reset HEAD~1
rm ./backport.sh
git cherry-pick 4e5bb2daa81f0cba0ef32d21f60eef102f9b1e44
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
