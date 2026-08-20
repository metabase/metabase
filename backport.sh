git reset HEAD~1
rm ./backport.sh
git cherry-pick fb00ed06ef0583e546f05d1bf5f8fddfbebdf4bf
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
