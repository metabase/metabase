git reset HEAD~1
rm ./backport.sh
git cherry-pick 5e79cee71fa385ed02f88b5dee2505b047d69e17
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
