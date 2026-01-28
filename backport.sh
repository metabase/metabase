git reset HEAD~1
rm ./backport.sh
git cherry-pick 24b7d886aa8e3f58bbab2f78af7c8cc0a349b995
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
