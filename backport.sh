git reset HEAD~1
rm ./backport.sh
git cherry-pick 3302e9cafda8cc327086ad2d3be3546a9d422e36
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
