git reset HEAD~1
rm ./backport.sh
git cherry-pick 09cc197a0bd4eb7149026e37e53c015a7eabb9cc
echo 'Resolve conflicts and force push this branch'
