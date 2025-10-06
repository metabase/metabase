git reset HEAD~1
rm ./backport.sh
git cherry-pick 1a28ee25c38ed2821248e87f049488945580e615
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
