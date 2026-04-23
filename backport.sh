git reset HEAD~1
rm ./backport.sh
git cherry-pick a5dcce0a28b1dc86c99a1680ff2bc21e27893f4c
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
