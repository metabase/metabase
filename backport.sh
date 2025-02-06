git reset HEAD~1
rm ./backport.sh
git cherry-pick c9d6609021f5db9275a0307190c3db7c727eb555
echo 'Resolve conflicts and force push this branch'
