git reset HEAD~1
rm ./backport.sh
git cherry-pick 82e428e4f5c72fa92ab4295ee2b9dd73ff566986
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
