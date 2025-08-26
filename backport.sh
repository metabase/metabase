git reset HEAD~1
rm ./backport.sh
git cherry-pick 997446ed84e97b390e3750fff7613428f662bdc9
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
