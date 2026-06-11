git reset HEAD~1
rm ./backport.sh
git cherry-pick f77ee419ccf057abb96a1d550a58e12e0e25ed94
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
