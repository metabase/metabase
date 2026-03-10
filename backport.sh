git reset HEAD~1
rm ./backport.sh
git cherry-pick 5e2e5108116c11f4f63775aee65c457b15111b0b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
