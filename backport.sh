git reset HEAD~1
rm ./backport.sh
git cherry-pick 7c77185acb85c81a71283d971543865ed7b116a6
echo 'Resolve conflicts and force push this branch'
