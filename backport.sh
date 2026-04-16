git reset HEAD~1
rm ./backport.sh
git cherry-pick 821b0529fd615b3c915bc5a229fadcdf1d9e4987
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
