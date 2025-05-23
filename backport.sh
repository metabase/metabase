git reset HEAD~1
rm ./backport.sh
git cherry-pick 0125b77c3dddafa5bf51ecbcb187ff1295eb75e9
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
