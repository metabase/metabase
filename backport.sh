git reset HEAD~1
rm ./backport.sh
git cherry-pick b9177009591362e0740d69ca73b2768274497e88
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
