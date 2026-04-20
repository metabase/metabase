git reset HEAD~1
rm ./backport.sh
git cherry-pick 608cc81d21794f1fec1969163e23eef745ca77bf
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
