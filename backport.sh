git reset HEAD~1
rm ./backport.sh
git cherry-pick 9a60d3949d3ae1737b81adfb4059e811e2370078
echo 'Resolve conflicts and force push this branch'
