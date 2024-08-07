git reset HEAD~1
rm ./backport.sh
git cherry-pick b8a2ed10469ea692164dc165989aca338df3b987
echo 'Resolve conflicts and force push this branch'
