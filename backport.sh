git reset HEAD~1
rm ./backport.sh
git cherry-pick 6a89c007fd16d2f01ad2dd9ae8eac76e5f493ffa
echo 'Resolve conflicts and force push this branch'
