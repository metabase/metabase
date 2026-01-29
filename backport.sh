git reset HEAD~1
rm ./backport.sh
git cherry-pick 390bcd144e45a80e4ec6d2d9e35c9c4ad13247b5
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
