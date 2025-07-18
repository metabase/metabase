git reset HEAD~1
rm ./backport.sh
git cherry-pick 517f98bf5c5c077faf6334362e666778d7ba7b5e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
