git reset HEAD~1
rm ./backport.sh
git cherry-pick db6013d82ab6a64ae96d8931bda9279d702c83e8
echo 'Resolve conflicts and force push this branch'
