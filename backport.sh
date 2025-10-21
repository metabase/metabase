git reset HEAD~1
rm ./backport.sh
git cherry-pick 0ab2b9f4f69854c174c1f7a21559c04b36e4ecc1
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
