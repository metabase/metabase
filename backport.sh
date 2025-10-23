git reset HEAD~1
rm ./backport.sh
git cherry-pick 392a3ebc4897a42f3dd67afe77fb6a40ff019c04
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
