git reset HEAD~1
rm ./backport.sh
git cherry-pick d7653edd9dde1ed21409e7fff96657802b15cb77
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
