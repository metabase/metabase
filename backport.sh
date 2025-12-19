git reset HEAD~1
rm ./backport.sh
git cherry-pick 7615ef0b9b27efe1e5139a5dc48023c8576c7230
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
