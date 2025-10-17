git reset HEAD~1
rm ./backport.sh
git cherry-pick 46c6bcd677e590e31e201d44614dac35e0657a33
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
