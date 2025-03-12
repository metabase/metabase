git reset HEAD~1
rm ./backport.sh
git cherry-pick 645d38ff4e0e265c42b57b123088f3233ebed4bc
echo 'Resolve conflicts and force push this branch'
