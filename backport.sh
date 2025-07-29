git reset HEAD~1
rm ./backport.sh
git cherry-pick b7d5408300e25987543f6a42e860f5bff297f8bb
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
