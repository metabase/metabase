git reset HEAD~1
rm ./backport.sh
git cherry-pick b8f7bff12bcfd7ca8d47465d5bff1a7dd9c82760
echo 'Resolve conflicts and force push this branch'
