git reset HEAD~1
rm ./backport.sh
git cherry-pick b7648138defa7fee9810d780df7ad3b809f5dcc0
echo 'Resolve conflicts and force push this branch'
