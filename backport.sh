git reset HEAD~1
rm ./backport.sh
git cherry-pick 05154519ddb38444a75e444574f0ef9ec5fa25a9
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
