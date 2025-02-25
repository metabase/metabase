git reset HEAD~1
rm ./backport.sh
git cherry-pick c46fba0914c5dc46ae6717b1e60a1bcd0d84e5c6
echo 'Resolve conflicts and force push this branch'
