git reset HEAD~1
rm ./backport.sh
git cherry-pick 9e980b93154aa1e4e5547c017be7d3bd57134ce8
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
