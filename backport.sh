git reset HEAD~1
rm ./backport.sh
git cherry-pick 9d013a5f2d737993d2fd5d551ffa55a39272a100
echo 'Resolve conflicts and force push this branch'
