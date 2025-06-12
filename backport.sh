git reset HEAD~1
rm ./backport.sh
git cherry-pick 0b06002dd5841b383413f83640d088c8c324c567
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
