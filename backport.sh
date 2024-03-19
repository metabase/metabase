git reset HEAD~1
rm ./backport.sh
git cherry-pick e7e35973ef8bc1255cf4ee549cbb9ad381c4c2c4
echo 'Resolve conflicts and force push this branch'
