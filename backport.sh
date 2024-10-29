git reset HEAD~1
rm ./backport.sh
git cherry-pick a223f819c72efd718e86e1267c3bed8ead447105
echo 'Resolve conflicts and force push this branch'
