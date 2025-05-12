git reset HEAD~1
rm ./backport.sh
git cherry-pick 0c2d3afa18bad6627cb58926304219af3fb1b3af
echo 'Resolve conflicts and force push this branch'
