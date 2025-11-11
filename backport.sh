git reset HEAD~1
rm ./backport.sh
git cherry-pick af0b621eeb33ec48ecd1a6bf93c3a5bbdd821bbe
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
