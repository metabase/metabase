git reset HEAD~1
rm ./backport.sh
git cherry-pick d3435af3993cca938df3929b9590409d05c81ad0
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
