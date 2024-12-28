git reset HEAD~1
rm ./backport.sh
git cherry-pick b04cfa86a650e1328a3680b3e4cceb6e524f49d4
echo 'Resolve conflicts and force push this branch'
