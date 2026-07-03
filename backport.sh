git reset HEAD~1
rm ./backport.sh
git cherry-pick 5c0455b3ecfdc3ccd89dcfae3eccf5699851c88b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
