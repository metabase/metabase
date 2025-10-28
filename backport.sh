git reset HEAD~1
rm ./backport.sh
git cherry-pick 4a23fc0ee0ac7d55f740b7c61c76253ebce324a3
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
