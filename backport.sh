git reset HEAD~1
rm ./backport.sh
git cherry-pick cd987d88a7bf78cf8686c051f55016d3f829f33e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
