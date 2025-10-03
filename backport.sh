git reset HEAD~1
rm ./backport.sh
git cherry-pick 8cb9ca883d5861e6a04502e76ae35a51954e3b4e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
