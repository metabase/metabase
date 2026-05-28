git reset HEAD~1
rm ./backport.sh
git cherry-pick 4e0dfc2136d5587b733a46356cfaf171d6ce4501
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
