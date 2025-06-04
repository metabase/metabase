git reset HEAD~1
rm ./backport.sh
git cherry-pick cc6d6d3435c380065e14be4e4b22e3c8d00d9728
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
