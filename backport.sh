git reset HEAD~1
rm ./backport.sh
git cherry-pick 0982712225e4c86f8870fb75cdd6fd8cd21cde76
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
