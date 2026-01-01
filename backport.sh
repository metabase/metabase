git reset HEAD~1
rm ./backport.sh
git cherry-pick d2d8d1fe83317e4a47dcce76b2ccde2269a1acbb
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
