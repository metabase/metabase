git reset HEAD~1
rm ./backport.sh
git cherry-pick bba0093d3841cdce77f1448caed90f1431e3864b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
