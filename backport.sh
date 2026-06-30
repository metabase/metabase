git reset HEAD~1
rm ./backport.sh
git cherry-pick b52b11e11adfc1b245eeab8b1bd77fe67cf336a2
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
