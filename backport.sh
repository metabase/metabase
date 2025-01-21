git reset HEAD~1
rm ./backport.sh
git cherry-pick a8927594c16f4660644e4e47329af99f6200dafe
echo 'Resolve conflicts and force push this branch'
