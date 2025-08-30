git reset HEAD~1
rm ./backport.sh
git cherry-pick e20f7e23820f4a213e91b6195f4a81fa3913f86b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
