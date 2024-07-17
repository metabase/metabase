git reset HEAD~1
rm ./backport.sh
git cherry-pick 1a07aa45ed7f1e9f1b7b137672855b8d578b73a1
echo 'Resolve conflicts and force push this branch'
