git reset HEAD~1
rm ./backport.sh
git cherry-pick 4dcc6bc9faa75b052ce437723be08dbce1a9a40d
echo 'Resolve conflicts and force push this branch'
