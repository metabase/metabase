git reset HEAD~1
rm ./backport.sh
git cherry-pick 36fa06a4bdb39e8725775b4a5fe7bd4ac0709354
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
