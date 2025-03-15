git reset HEAD~1
rm ./backport.sh
git cherry-pick 2ec9773d05d420fff63d596ed10002c07031f4a7
echo 'Resolve conflicts and force push this branch'
