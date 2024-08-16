git reset HEAD~1
rm ./backport.sh
git cherry-pick 6b9b5d98362c21d18d36ea5adaaddbc10b7b423b
echo 'Resolve conflicts and force push this branch'
