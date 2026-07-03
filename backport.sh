git reset HEAD~1
rm ./backport.sh
git cherry-pick 06ed2904718e21c8ba7f5774a6e5e7f3653e31c6
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
