git reset HEAD~1
rm ./backport.sh
git cherry-pick ec842e146cb575e5c55ef2a1e2bbed149aec43ed
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
