git reset HEAD~1
rm ./backport.sh
git cherry-pick 6908f26b766bcce157ada48a4d1d99d3fb7f403a
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
