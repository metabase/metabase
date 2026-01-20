git reset HEAD~1
rm ./backport.sh
git cherry-pick 3b8e1ecaa4eeb48aa8b2210c11f34881516e5cb3
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
