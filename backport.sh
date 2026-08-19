git reset HEAD~1
rm ./backport.sh
git cherry-pick 80950071f0e4cc965127924e2593524b877c95cd
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
