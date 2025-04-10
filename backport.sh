git reset HEAD~1
rm ./backport.sh
git cherry-pick 20e9cd8fc1a96c432c4f8bd24eabccbf787a1734
echo 'Resolve conflicts and force push this branch'
