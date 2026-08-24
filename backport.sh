git reset HEAD~1
rm ./backport.sh
git cherry-pick 4b8fd9848ec83a19b1118fb9028b93c9f7ea2a7a
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
