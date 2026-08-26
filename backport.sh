git reset HEAD~1
rm ./backport.sh
git cherry-pick b0525d2dc48e350dbe860153af0e22bbd6d7fe45
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
