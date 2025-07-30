git reset HEAD~1
rm ./backport.sh
git cherry-pick 89a7f3c1b6e24634a4af226a1bb0deae8382bd57
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
