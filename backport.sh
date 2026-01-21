git reset HEAD~1
rm ./backport.sh
git cherry-pick 76fcb4d57346dfd18413950999626c1e6a6d213d
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
