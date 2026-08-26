git reset HEAD~1
rm ./backport.sh
git cherry-pick cb7114ff8a8b9e84e19102aab538f1f503a1d0c1
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
