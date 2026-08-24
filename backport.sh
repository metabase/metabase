git reset HEAD~1
rm ./backport.sh
git cherry-pick 2350e6a952ed230bf59059cbce8db997fa6bd038
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
