git reset HEAD~1
rm ./backport.sh
git cherry-pick 2e4c39904e3bdb96403961fd56ecaeb5d38ba896
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
