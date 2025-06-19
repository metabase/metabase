git reset HEAD~1
rm ./backport.sh
git cherry-pick 2b1efe414abed85866fd8424e9b882c8e02b504b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
