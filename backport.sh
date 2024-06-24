git reset HEAD~1
rm ./backport.sh
git cherry-pick 1c2b5cc346038a85817409f3f253443c2f2f5612
echo 'Resolve conflicts and force push this branch'
