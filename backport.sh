git reset HEAD~1
rm ./backport.sh
git cherry-pick 1e7823d1763abdaf82862972f4f01ce698426699
echo 'Resolve conflicts and force push this branch'
