git reset HEAD~1
rm ./backport.sh
git cherry-pick 2a053bc7627c7d013c9c8e992ff8f7b98f9edc68
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
