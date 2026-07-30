git reset HEAD~1
rm ./backport.sh
git cherry-pick 9d391efca1b301719867fc684576cc3e6e1d3c1b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
