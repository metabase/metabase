git reset HEAD~1
rm ./backport.sh
git cherry-pick aa22957e48a3cd1c96340ff2a9df2cfe16eeb70d
echo 'Resolve conflicts and force push this branch'
