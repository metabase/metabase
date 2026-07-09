git reset HEAD~1
rm ./backport.sh
git cherry-pick 1c90ab2c31bbfdca0d8e579cb83765f204350856
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
