git reset HEAD~1
rm ./backport.sh
git cherry-pick 5cad344fd0245bcef82797c23fd63074f0b26e7f
echo 'Resolve conflicts and force push this branch'
