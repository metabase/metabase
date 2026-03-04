git reset HEAD~1
rm ./backport.sh
git cherry-pick 57586f24272213ea2a0efe019bff8bf7a62b8ac8
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
