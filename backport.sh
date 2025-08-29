git reset HEAD~1
rm ./backport.sh
git cherry-pick a08cb0df7bdb6d95b7219c657172840c7dd4ec93
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
