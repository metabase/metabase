git reset HEAD~1
rm ./backport.sh
git cherry-pick 44b811bdccdcdf46d6fde8e077d5af81b888213a
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
