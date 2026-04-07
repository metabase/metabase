git reset HEAD~1
rm ./backport.sh
git cherry-pick 9b768293047d220999d491c391fb4e0dc0a7d953
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
